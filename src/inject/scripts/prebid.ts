import logger from '../../logger';
import { sendToContentScript } from '../../utils';
import constants from '../../constants.json';

declare global {
    interface Window {
        pbjs: any;
        _pbjsGlobals: string[];
        PREBID_TIMEOUT: number;
    }
}
class Prebid {
    globalPbjs: any = window.pbjs;
    bids: IPrebidBid[];
    slots: IPrebidSlot[];
    config: IPrebidConfig;
    eids: IPrebidEids[];
    stopLoop: boolean = false;


    init(): void {
        setTimeout(() => { this.stopLoop = true }, 8000);
        this.loop();
    }

    loop(): void {
        if (this.globalPbjs) {
            this.globalPbjs.que.push(() => this.addEventListeners());
            // this.globalPbjs.que.push(() => setInterval(() => this.sendDetailsToContentScript(), 1000));
        } else if (!this.stopLoop) {
            this.globalPbjs = this.isPrebidInPage();
            requestIdleCallback(() => this.loop());
            // setTimeout(() => this.loop(), 1000);
        }
    }

    addEventListeners(): void {
        this.globalPbjs.onEvent('auctionInit', (auctionInitData: IPrebidAuctionEventData) => {
            logger.log('[Injected] auctionInit', { auctionInitData });
            this.sendDetailsToContentScript()
        });

        this.globalPbjs.onEvent('auctionEnd', (auctionEndData: IPrebidAuctionEventData) => {
            logger.log('[Injected] auctionEnd', { auctionEndData });
            this.sendDetailsToContentScript()
        });
        
        this.globalPbjs.onEvent('bidRequested', (bidRequested: IPrebidAuctionEventData) => {
            logger.log('[Injected] bidRequested', { bidRequested });
            this.sendDetailsToContentScript()
        });
        
        this.globalPbjs.onEvent('noBid', (noBid: IPrebidAuctionEventData) => {
            logger.log('[Injected] noBid', { noBid });
            this.sendDetailsToContentScript()
        });
        
        this.globalPbjs.onEvent('bidWon', (bidWon: IPrebidAuctionEventData) => {
            logger.log('[Injected] bidWon', { bidWon });
            this.sendDetailsToContentScript()
        });
        logger.log('[Injected] event listeners added')
    }

    getPrebidBids(): IPrebidBid[] {
        const allBidResponses: { [key: string]: IPrebidBid[]; } = this.globalPbjs.getBidResponses();
        const prebidSlots = this.getPrebidSlots();
        let prebidBids: IPrebidBid[] = [];

        // _bidsReceived deprecated since prebid 1.0
        if (!prebidBids[0] && this.globalPbjs._bidsReceived) {
            prebidBids = this.globalPbjs._bidsReceived;
        }

        if (!prebidBids[0] && prebidSlots[0]) {
            prebidSlots.forEach(prebidSlot => {
                const bid_responses: { bids: IPrebidBid[]; } = this.globalPbjs.getBidResponsesForAdUnitCode(prebidSlot.code);
                bid_responses.bids.forEach(bid => {
                    prebidBids.push(bid);
                });
            });
        }

        if (!prebidBids[0] && Object.keys(allBidResponses)[0]) {
            Object.keys(allBidResponses).forEach(key => {
                allBidResponses[key][0] && allBidResponses[key].forEach(bid => {
                    prebidBids.push(bid);
                });
            })
        }

        return prebidBids;

    }

    getPrebidSlots(): IPrebidAdUnit[] {
        //  copy array
        return this.globalPbjs?.adUnits.slice() || [];
    }

    isPrebidInPage() {
        const pbjsGlobals = window._pbjsGlobals;
        if (pbjsGlobals && pbjsGlobals.length > 0) {
            const pbjsGlobal = window[pbjsGlobals[0] as keyof Window];

            const libLoaded = pbjsGlobal.libLoaded;
            if (libLoaded) {
                return pbjsGlobal;
            }
        }
    }

    processBids(): void {
        // Process bids
        this.bids.every((bid) => {
            if (!bid.bidderCode) {
                // no bidderCode in bid => stop loop 
                return false;
            };

            // consolidating CPMs into pbjs.adUnits
            this.slots.forEach(slot => {
                if (slot.code == bid.adUnitCode) {
                    slot.bids.every((slotBid) => {
                        if (slotBid.adId === bid.adId) {
                            // allready has an adId => stop loop 
                            return false;
                        };
                        if (slotBid.bidder == bid.bidder && typeof slotBid.cpm == 'undefined') {
                            slotBid.adId = bid.adId
                            slotBid.cpm = bid.cpm;
                            // slotBid updated => stop loop 
                            return false;
                        }
                        // continue loop
                        return true;
                    });
                }
            });


            return true
        });


        // sort bidders by requestTimestamp
    }

    sendDetailsToContentScript(): void {
        const filterEvent = (event: any) => {
            return (
                event.eventType === 'bidRequested'
                || event.eventType === 'bidResponse'
                || event.eventType === 'noBid'
                || event.eventType === 'auctionEnd'
                || event.eventType === 'auctionInit'
                || event.eventType === 'bidWon'
            )
        };
        this.bids = this.getPrebidBids();
        this.config = this.globalPbjs.getConfig();
        this.eids = this.globalPbjs.getUserIdsAsEids ? this.globalPbjs.getUserIdsAsEids() : [];
        this.slots = this.getPrebidSlots();
        this.processBids();
        const prebidDetail: IPrebidDetails = {
            version: this.globalPbjs.version,
            slots: this.slots,
            timeout: window.PREBID_TIMEOUT || null,
            events: this.globalPbjs?.getEvents ? this.globalPbjs.getEvents().filter((event: any) => filterEvent(event)) : [],
            config: this.config,
            bids: this.bids,
            auctions: null,
            eids: this.eids
        };
        sendToContentScript(constants.EVENTS.SEND_PREBID_DETAILS_TO_BACKGROUND, prebidDetail);
    }
}

export const preBid = new Prebid();

export interface IPrebidBid {
    ad: string;
    adId: string;
    adUnitCode: string;
    adUrl: string;
    adserverTargeting: any;
    hb_adid: string;
    hb_adomain: string;
    hb_bidder: string;
    hb_format: string;
    hb_pb: string;
    hb_size: string;
    hb_source: string;
    auctionId: string;
    bidder: string;
    bidderCode: string;
    cpm: number;
    creativeId: string;
    currency: string;
    dealId: string;
    getSize: any
    getStatusCode: any
    height: number;
    mediaType: string;
    meta: {
        networkId: number;
        buyerId: number;
        advertiserDomains: string[],
        clickUrl: string;
    }
    netRevenue: true
    originalCpm: number;
    originalCurrency: string;
    params: {
        publisherId: string;
        adSlot: string;
        [key: string]: string | number;
    }[]
    partnerImpId: string;
    pbAg: string;
    pbCg: string;
    pbDg: string;
    pbHg: string;
    pbLg: string;
    pbMg: string;
    pm_dspid: number;
    pm_seat: string;
    referrer: string;
    requestId: string;
    requestTimestamp: number;
    responseTimestamp: number;
    size: string;
    source: string;
    status: string;
    statusMessage: string;
    timeToRespond: number;
    ttl: number;
    width: number;
}

interface IPrebidEventBidder {
    requestTimestamp?: number;
    responseTime?: number;
    responseTimestamp?: number;
}

interface IPrebidEvents {
    auctionStartTimestamp: number;
    auctionEndTimestamp: number;
    bidders: {
        [key: string]: IPrebidEventBidder;
    };
}

interface IPrebidSlotBid {
    adId: string;
    bidder: string;
    cpm: number;
    params: {
        [key: string]: any;
    }
}

interface IPrebidMediaType {
    banner: {
        sizes: number[][]
    };
    native: {
        type: string;
        adTemplate: string;
        image: {
            required: boolean;
            sizes: number[];
        }
        sendTargetingKeys: boolean;
        sponsoredBy: {
            required: boolean;
        }
        title: {
            required: boolean;
            len: number;
        }
    };
    video: {
        sizes: number[][];
        playerSize: number[][];
        context: string;
        mimes: string[];
        maxduration: number;
        api: number[];
        protocols: number[];
    }
}

interface IPrebidSlot {
    bids: IPrebidSlotBid[];
    code: string;
    mediaTypes: IPrebidMediaType[];
}

export interface IPrebidAdUnit {
    bids: IPrebidSlotBid[];
    code: string;
    mediaTypes: IPrebidMediaType[];
    sizes: number[][];
    transactionId: string
}

interface IPrebidConfigPriceBucket {
    precision: number;
    min: number;
    max: number;
    increment: number;
}

interface IPrebidConfigUserSync {
    name: string;
    storage: {
        type: string;
        name: string;
        expires: number
    }; params: {
        [key: string]: string
    }
}

interface IPrebidConfigUserSync {
    syncEnabled: boolean
    filterSettings: {
        image: {
            bidders: string;
            filter: string;
        }
    },
    syncsPerBidder: number;
    syncDelay: number;
    auctionDelay: number;
    userIds: IPrebidConfigUserSync[];
}
interface IPrebidConfig {
    debug: boolean;
    bidderTimeout: number;
    publisherDomain: string;
    priceGranularity: string;
    consentManagement: {
        allowAuctionWithoutConsent: boolean;
        defaultGdprScope: string;
        cmpApi: string;
        timeout: number;
        coppa: boolean;
        gdpr: {
            cmpApi: string;
            defaultGdprScope: boolean;
            timeout: number;
            allowAuctionWithoutConsent: boolean;
            consentData: {
                tcString: string;
                addtlConsent: string;
                gdprApplies: boolean;
            };
            rules: {
                purpose: string;
                enforcePurpose: boolean;
                enforceVendor: boolean;
                vendorExceptions: string[];
            }[]
        };
        usp: {
            cmpApi: string;
            getUSPData: {
                uspString: string;
            }
            timeout: number;
        };
    };
    customPriceBucket: {
        buckets: IPrebidConfigPriceBucket[];
    };
    mediaTypePriceGranularity: {
        banner: { buckets: { precision: number, min: number, max: number, increment: number }[] }
        native: { buckets: { precision: number, min: number, max: number, increment: number }[] }
        video: { buckets: { precision: number, min: number, max: number, increment: number }[] }
        'video-outstream': { buckets: { precision: number, min: number, max: number, increment: number }[] }
        priceGranularity: string;
        publisherDomain: string;
    };
    s2sConfig: {
        accountId: string;
        adapter: string;
        adapterOptions: any;
        app: {
            bundle: string;
            id: any;
            name: string;
            paid: number;
            privacypolicy: number;
            publisher: {
                domain: string;
                id: string;
                name: string;
            };
            storeurl: string;
        };
        bidders: string[];
        device: {
            ifa: string;
            ifa_type: string;
            lmt: string;
            os: string;
        }
        enabled: boolean;
        endpoint: string;
        syncEndpoint: string;
        maxBids: number;
        syncUrlModifier: any;
        timeout: number;
    };
    targetingControls: {
        allowTargetingKeys: string[];
        alwaysIncludeDeals: boolean;
    }
    enableSendAllBids: boolean;
    useBidCache: boolean;
    deviceAccess: boolean;
    bidderSequence: string;
    timeoutBuffer: number;
    disableAjaxTimeout: boolean;
    maxNestedIframes: number;
    auctionOptions: any;
    userSync: IPrebidConfigUserSync,
    cache: {
        url: string;
    },
    [key: string]: any;
}

export interface IBidderEvent {
    args: {
        auctionId: string;
        bidderCode: string;
        adUnitCode: string;
        adUnitCodes: string[];
        adUnits: IPrebidAdUnit[];
        bidder: string;
        start: number;
        requestTimestamp: number;
        responseTimestamp: number;
        endTimestamp: number;
        auctionEnd: number;
        timestamp: number;
        bidderRequests: IPrebidBidderRequest[];
        bidsReceived: IPrebidBid[];
        noBids: IPrebidBid[];
        cpm: number;
        currency: string;
        timeToRespond: number;
    };
    eventType: string;
    id: string;
    elapsedTime: number;
}

export interface IPrebidDetails {
    version: string;
    slots: IPrebidSlot[];
    timeout: number;
    events: IBidderEvent[];
    config: IPrebidConfig;
    bids: IPrebidBid[];
    auctions: IPrebidAuctions;
    eids: IPrebidEids[];
}

interface IPrebidAuctionEventData {
    adUnitCodes: string[];
    adUnits: IPrebidAdUnit[];
    auctionEnd: number;
    auctionId: string;
    auctionStatus: string
    bidderRequests: IPrebidBidderRequest[];
    bidsReceived: IPrebidBid[]
    labels: any;
    noBids: IPrebidBid[];
    timeout: number;
    timestamp: number;
    winningBids: any[]
}

export interface IPrebidBidderRequest {
    auctionId: string;
    auctionStart: number;
    bidderCode: string;
    bidderRequestId: string;
    bids: IPrebidBid[];
    ceh: any;
    gdprConsent: {
        consentString: string;
        vendorData: {
            addtlConsent: string
            cmpId: number
            cmpStatus: string
            cmpVersion: number
            eventStatus: string
            gdprApplies: boolean
            isServiceSpecific: boolean
            listenerId: number
            outOfBand: {
                allowedVendors: any,
                disclosedVendors: any
            }
            publisher: {
                consents: {
                    [key: number]: boolean;
                },
                legitimateInterests: {
                    [key: number]: boolean;
                },
                customPurpose: any;
                restrictions: any;
            }
            publisherCC: string;
            purpose: {
                consents: {
                    [key: number]: boolean;
                },
                legitimateInterests: {
                    [key: number]: boolean;
                }
            }
            purposeOneTreatment: boolean;
            specialFeatureOptins: {
                [key: number]: boolean;
            }
            tcString: string;
            tcfPolicyVersion: number;
            useNonStandardStacks: boolean;
            vendor: {
                consents: {
                    [key: number]: boolean;
                }, legitimateInterests: {
                    [key: number]: boolean;
                }
            }

        },
        gdprApplies: boolean;
        addtlConsent: string;
        apiVersion: number
    }
    publisherExt: any;
    refererInfo: {
        referer: string;
        reachedTop: boolean;
        isAmp: boolean;
        numIframes: number;
        stack: string[];
    }
    start: number;
    endTimestamp: number;
    elapsedTime: number;
    timeout: number;
    userExt: any;

}

interface IPrebidAuctions {
    [key: string]: IPrebidAuctionEventData;
}

export interface IPrebidEids {
    source: string;
    uids: IUuids[];
}

interface IUuids {
    atype: number;
    id: string;
    ext: {
        [key: string]: string;
    }
}