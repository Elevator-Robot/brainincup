const TEST_MODE_URL_PARAM = 'testmode';
const NO_CONVERSATIONS_URL_PARAM = 'noconversations';

const TEST_MODE_ALLOWED =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_TESTMODE_AUTH === 'true';

const getUrlParams = (): URLSearchParams | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return new URLSearchParams(window.location.search);
};

export const isTestModeEnabled = (): boolean => {
  if (!TEST_MODE_ALLOWED) {
    return false;
  }
  const params = getUrlParams();
  return params?.get(TEST_MODE_URL_PARAM) === 'true';
};

export const isNoConversationsTestMode = (): boolean => {
  if (!isTestModeEnabled()) {
    return false;
  }
  const params = getUrlParams();
  return params?.get(NO_CONVERSATIONS_URL_PARAM) === 'true';
};

