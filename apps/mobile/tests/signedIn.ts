import { VALID_DESIGNS, type DesignSpec } from '@streetwear/shared';
import { setApiForTests } from '../src/api';
import { createMockApi, MOCK_OTP_CODE, type MockOptions } from '../src/api/mock';
import type { ApiClient } from '../src/api/types';
import { sessionStore, startSession } from '../src/auth/session';
import { createMemoryTokenStore, setTokenStoreForTests } from '../src/auth/tokens';

export const PHONE = '+22890123456';

/** Mock API branchée comme singleton de l'app, session ouverte, un design et deux t-shirts au panier. */
export async function signedInApi(
  options: MockOptions = {},
  withCart = true,
): Promise<{ api: ApiClient; designId: string }> {
  const tokens = createMemoryTokenStore();
  setTokenStoreForTests(tokens);
  const api = createMockApi({ latencyMs: 0, tokens, payDelayMs: 0, ...options });
  setApiForTests(api);
  await api.requestOtp(PHONE);
  const result = await api.verifyOtp(PHONE, MOCK_OTP_CODE);
  await startSession(result);
  let designId = '';
  if (withCart) {
    const design = await api.createDesign({ spec: VALID_DESIGNS.patternOnly as DesignSpec });
    designId = design.id;
    await api.addCartItem({ designId, size: 'M', quantity: 2 });
  }
  sessionStore.setState({ expired: false });
  return { api, designId };
}
