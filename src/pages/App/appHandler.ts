import constants from '../../constants.json';

class AppHandler {
  getDataFromBackground(cb: any): void {
    chrome.runtime.sendMessage({ type: constants.EVENTS.REQUEST_DATA_FROM_BACKGROUND }, cb);
  }
}

export const appHandler = new AppHandler();
