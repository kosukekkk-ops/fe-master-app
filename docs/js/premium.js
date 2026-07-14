/* premium.js — プレミアム(買い切りIAP)の状態管理と購入処理
 *
 * 方針(サーバーレス):
 * - 購入状態の真実はStoreKit。localStorageのフラグは表示を即時にするための
 *   キャッシュで、ネイティブ起動時に Premium.sync() が必ず照合し直す。
 * - Web/PWAにはストアが無いため全機能開放のまま(Web版の扱いは公開前に別途決定)。
 * - プラグインは @capgo/native-purchases。バンドラ無し構成のため、
 *   window.Capacitor.Plugins 経由で呼び出す(ネイティブ側で自動登録される)。
 */
const Premium = (() => {
  const PRODUCT_ID = 'io.github.kosukekkkops.femaster.premium';

  const isNative = () =>
    !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const plugin = () =>
    (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativePurchases) || null;

  let cachedPrice = null;

  // 今プレミアムか(同期的・描画用)。Webは常にtrue=全機能開放。
  function unlocked() {
    if (!isNative()) return true;
    return !!Store.getPremium();
  }

  // StoreKitの現在のentitlementsと端末フラグを同期(起動時・復元時に呼ぶ)。
  // onlyCurrentEntitlements: 共有端末で他人のApple IDの購入が漏れて見えるのを防ぐ。
  async function sync() {
    const np = plugin();
    if (!np) return unlocked();
    try {
      const { purchases } = await np.getPurchases({ onlyCurrentEntitlements: true });
      const has = (purchases || []).some(t => t.productIdentifier === PRODUCT_ID);
      Store.setPremium(has);
      return has;
    } catch (e) {
      console.warn('Premium.sync failed', e);
      return unlocked();   // 照会失敗時は現状のフラグを維持(オフライン等)
    }
  }

  // ストア上の表示価格(例 "¥720")。取得失敗時は空文字。
  async function price() {
    if (cachedPrice) return cachedPrice;
    const np = plugin();
    if (!np) return '';
    try {
      const { product } = await np.getProduct({ productIdentifier: PRODUCT_ID });
      cachedPrice = (product && product.priceString) || '';
      return cachedPrice;
    } catch (e) {
      console.warn('Premium.price failed', e);
      return '';
    }
  }

  // 購入。成功でtrue、ユーザーキャンセル等は例外がthrowされる。
  async function buy() {
    const np = plugin();
    if (!np) throw new Error('この端末では購入できません');
    await np.purchaseProduct({ productIdentifier: PRODUCT_ID });
    Store.setPremium(true);
    return true;
  }

  // 購入を復元(Apple必須要件)。復元後にentitlementsを照合して結果を返す。
  async function restore() {
    const np = plugin();
    if (!np) throw new Error('この端末では復元できません');
    await np.restorePurchases();
    return await sync();
  }

  return { PRODUCT_ID, isNative, unlocked, sync, price, buy, restore };
})();
