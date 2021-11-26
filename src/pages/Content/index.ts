// Extension content.js script, listens for (window) messages from
// injected script, build auction data structure. Also listens for
// (chrome) messages from Popup.js when it runs and responds to it
// with the auction data it collected so far
import logger from '../../logger';
import constants from '../../constants.json';
import { IGoogleAdManagerDetails } from '../../inject/scripts/googleAdManager';
import { IPrebidDetails, IPrebidBidWonEventData, IPrebidAuctionEndEventData } from '../../inject/scripts/prebid';
import { ITcfDetails } from '../../inject/scripts/tcf';

class Content {
  prebid: IPrebidDetails = {} as IPrebidDetails;
  googleAdManager: IGoogleAdManagerDetails;
  tcf: ITcfDetails;

  init() {
    logger.log('[Content] init()');
    this.listenToInjectedScript();
    this.listenToPopupScript();
  }

  listenToInjectedScript() {
    window.addEventListener(
      'message',
      (event) => {
        if (event.source != window) {
          return;
        }
        const { type, payload } = event.data;

        switch (type) {
          case constants.EVENTS.REQUEST_CONSOLE_STATE: {
            // update injected
            this.sendConsoleStateToInjected();

            break;
          }

          case constants.EVENTS.SEND_GAM_DETAILS_TO_BACKGROUND: {
            this.googleAdManager = JSON.parse(payload);

            // update background page
            this.updateBackgroundPage(constants.EVENTS.SEND_GAM_DETAILS_TO_BACKGROUND, this.googleAdManager);

            // update injected
            this.updateMasks();

            break;
          }

          case constants.EVENTS.SEND_PREBID_DETAILS_TO_BACKGROUND: {
            this.prebid = JSON.parse(payload);

            // update background page
            this.updateBackgroundPage(constants.EVENTS.SEND_PREBID_DETAILS_TO_BACKGROUND, this.prebid);

            // update injected
            this.updateMasks();

            break;
          }

          case constants.EVENTS.SEND_TCF_DETAILS_TO_BACKGROUND: {
            this.tcf = JSON.parse(payload);
            // update background page
            this.updateBackgroundPage(constants.EVENTS.SEND_TCF_DETAILS_TO_BACKGROUND, this.tcf);

            // update injected
            this.updateMasks();

            break;
          }
        }
      },
      false
    );
  }

  listenToPopupScript() {
    chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
      if (request.type === constants.CONSOLE_TOGGLE) {
        document.dispatchEvent(new CustomEvent(constants.CONSOLE_TOGGLE, { detail: request.consoleState }));
      }
      sendResponse();
    });
  }

  prepareMaskObjects() {
    logger.log('[Content] preparing masks');
    const lastAuctionEndEvent = ((this.prebid.events || []) as IPrebidAuctionEndEventData[])
      .filter((event) => event.eventType === 'auctionEnd')
      .sort((a, b) => (a.args.timestamp > b.args.timestamp ? 1 : -1))
      .pop();
    const masks = lastAuctionEndEvent?.args?.adUnits.map((slot) => {
      const slotsBidWonEvent = <IPrebidBidWonEventData>(
        this.prebid?.events.find((event) => event.eventType === 'bidWon' && (event as IPrebidBidWonEventData).args.adUnitCode === slot.code)
      );
      return {
        elementId: slot.code,
        creativeRenderTime: Date.now(), // TODO - get creative render time from prebid
        winningCPM: slotsBidWonEvent?.args.cpm ? Math.round(slotsBidWonEvent?.args.cpm * 100) / 100 : undefined,
        winningBidder: slotsBidWonEvent?.args.bidder || slotsBidWonEvent?.args.bidderCode,
        currency: slotsBidWonEvent?.args.currency,
        timeToRespond: slotsBidWonEvent?.args.timeToRespond,
      };
    });
    logger.log('[Content] mask ready', masks);
    return masks;
  }

  sendConsoleStateToInjected() {
    chrome.storage.local.get(constants.CONSOLE_TOGGLE, (result) => {
      const checked = result ? result[constants.CONSOLE_TOGGLE] : false;
      document.dispatchEvent(new CustomEvent(constants.CONSOLE_TOGGLE, { detail: checked }));
    });
  }

  updateBackgroundPage(type: string, payload: any) {
    chrome.runtime.sendMessage({
      type,
      payload,
    });
  }

  updateMasks() {
    const masks = this.prepareMaskObjects();
    document.dispatchEvent(new CustomEvent(constants.SAVE_MASKS, { detail: masks }));
  }
}

const content = new Content();
content.init();
