import type { Metadata } from "next";
import "./coming-soon.css";

export const metadata: Metadata = {
  title: "Stordex — 受発注・在庫管理クラウド（近日公開）",
  description:
    "Stordex は、卸売・物流業向けに受発注・在庫・請求書管理を一元化する B2B クラウドサービスです。近日公開。",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Stordex — 受発注・在庫管理クラウド",
    description:
      "受発注・在庫・請求書を、ひとつのクラウドで。卸売・物流業のための B2B SaaS。近日公開。",
    type: "website",
    url: "https://stordex.jp/",
  },
};

export default function ComingSoonPage() {
  return (
    <div className="cs-root">
      <header className="cs-header">
        <div className="cs-container cs-header-row">
          <a className="cs-logo" href="/" aria-label="Stordex">
            <span className="cs-logo-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="2" width="7" height="7" rx="1" fill="currentColor" />
                <rect x="11" y="2" width="7" height="7" rx="1" fill="currentColor" opacity="0.55" />
                <rect x="2" y="11" width="7" height="7" rx="1" fill="currentColor" opacity="0.55" />
                <rect x="11" y="11" width="7" height="7" rx="1" fill="currentColor" />
              </svg>
            </span>
            <span className="cs-logo-text">Stordex</span>
          </a>
          <span className="cs-badge" aria-label="Coming Soon">
            <span className="cs-badge-dot" aria-hidden="true" />
            Coming Soon
          </span>
        </div>
      </header>

      <main>
        {/* ===== Hero ===== */}
        <section className="cs-hero cs-container" aria-labelledby="hero-title">
          <p className="cs-eyebrow">For wholesale &amp; logistics</p>
          <h1 id="hero-title" className="cs-hero-title">
            受発注・在庫・請求を、<br />
            ひとつのクラウドで。
          </h1>
          <p className="cs-hero-lead">
            紙とExcelで回していた業務を、ブラウザ一枚に。Stordex
            は卸売・物流業の現場のために設計された、シンプルな B2B クラウドサービスです。
          </p>
          <div className="cs-cta">
            <a
              className="cs-btn cs-btn-primary"
              href="mailto:sales@nammoku-solutions.com?subject=Stordex%20%E5%85%88%E8%A1%8C%E7%99%BB%E9%8C%B2&body=%E4%BC%9A%E7%A4%BE%E5%90%8D%3A%0A%E3%81%94%E6%8B%85%E5%BD%93%E8%80%85%E3%81%8A%E5%90%8D%E5%89%8D%3A%0A%E6%A5%AD%E7%A8%AE%2F%E5%8F%96%E6%89%B1%E5%95%86%E5%93%81%3A%0A%E6%9C%80%E9%80%9F%E5%88%A9%E7%94%A8%E5%B8%8C%E6%9C%9B%E6%99%82%E6%9C%9F%3A%0A%E3%81%94%E8%A6%81%E6%9C%9B%2F%E8%B3%AA%E5%95%8F%3A"
            >
              先行登録する
              <span aria-hidden="true">→</span>
            </a>
            <a className="cs-btn cs-btn-secondary" href="#features">
              特長を見る
            </a>
          </div>
        </section>

        {/* ===== Features ===== */}
        <section className="cs-section" id="features" aria-labelledby="features-title">
          <div className="cs-container">
            <div className="cs-section-head">
              <p className="cs-eyebrow">What you get</p>
              <h2 id="features-title" className="cs-section-title">
                受注から請求まで、業務の流れをひとつに。
              </h2>
              <p className="cs-section-lead">
                受注・出荷・在庫の引き当て・請求書発行までを一気通貫で。現場の Excel と
                FAX 運用を、そのまま Web に置き換えます。
              </p>
            </div>

            <div className="cs-feature-grid">
              <article className="cs-feature">
                <div className="cs-feature-num">01</div>
                <h3>受発注管理</h3>
                <p>
                  得意先からの注文と仕入先への発注を、見積・受注・出荷までステータスで管理。
                </p>
              </article>
              <article className="cs-feature">
                <div className="cs-feature-num">02</div>
                <h3>在庫管理</h3>
                <p>
                  商品マスタと入出庫を直結。受注時に自動引き当て、在庫切れを未然に検知。
                </p>
              </article>
              <article className="cs-feature">
                <div className="cs-feature-num">03</div>
                <h3>請求書発行</h3>
                <p>
                  受注データから請求書をワンクリック生成。A4 印刷と PDF 保存にそのまま対応。
                </p>
              </article>
              <article className="cs-feature">
                <div className="cs-feature-num">04</div>
                <h3>分析ダッシュボード</h3>
                <p>
                  得意先別・商品別の売上動向を可視化。Excel に頼らず即座に意思決定。
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ===== Audience ===== */}
        <section className="cs-section cs-section-muted" id="audience" aria-labelledby="audience-title">
          <div className="cs-container">
            <div className="cs-section-head">
              <p className="cs-eyebrow">For who</p>
              <h2 id="audience-title" className="cs-section-title">
                こんな現場のために。
              </h2>
            </div>
            <ul className="cs-audience">
              <li>
                <h3>卸売業</h3>
                <p>電話・FAX で受注を受け、手書きで在庫を管理している。</p>
              </li>
              <li>
                <h3>物流・倉庫業</h3>
                <p>入出庫の記録と請求書発行を Excel で二重管理している。</p>
              </li>
              <li>
                <h3>製造業</h3>
                <p>部品の発注と在庫の同期に時間がかかっている。</p>
              </li>
              <li>
                <h3>5〜30 名規模</h3>
                <p>専任の情シスはいないが、業務はクラウドで効率化したい。</p>
              </li>
            </ul>
          </div>
        </section>

        {/* ===== How it works ===== */}
        <section className="cs-section" id="how" aria-labelledby="how-title">
          <div className="cs-container">
            <div className="cs-section-head">
              <p className="cs-eyebrow">How it works</p>
              <h2 id="how-title" className="cs-section-title">
                シンプルな B2B 契約。
              </h2>
              <p className="cs-section-lead">
                月額制でご提供します。料金プランは貴社の業務規模に応じて個別にお見積りいたします。
              </p>
            </div>

            <ol className="cs-steps">
              <li>
                <span className="cs-steps-num">01</span>
                <div>
                  <h3>お問い合わせ</h3>
                  <p>メールにてご相談ください。現在の業務フローをヒアリングします。</p>
                </div>
              </li>
              <li>
                <span className="cs-steps-num">02</span>
                <div>
                  <h3>デモ・お見積り</h3>
                  <p>オンラインでデモをご覧いただき、月額料金をご提示します。</p>
                </div>
              </li>
              <li>
                <span className="cs-steps-num">03</span>
                <div>
                  <h3>導入</h3>
                  <p>マスタデータ移行をサポート。最短 1 週間で運用を開始できます。</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* ===== Contact ===== */}
        <section className="cs-contact" id="contact" aria-labelledby="contact-title">
          <div className="cs-container cs-contact-inner">
            <p className="cs-eyebrow">Get in touch</p>
            <h2 id="contact-title" className="cs-contact-title">
              業務改善の最初の一歩、<br />ご相談ください。
            </h2>
            <p className="cs-contact-lead">
              先行登録・デモ依頼・お見積り・パートナーシップに関するご相談はメールにて。原則 2 営業日以内に返信いたします。
            </p>
            <div className="cs-cta">
              <a
                className="cs-btn cs-btn-primary"
                href="mailto:sales@nammoku-solutions.com?subject=Stordex%20%E5%85%88%E8%A1%8C%E7%99%BB%E9%8C%B2&body=%E4%BC%9A%E7%A4%BE%E5%90%8D%3A%0A%E3%81%94%E6%8B%85%E5%BD%93%E8%80%85%E3%81%8A%E5%90%8D%E5%89%8D%3A%0A%E6%A5%AD%E7%A8%AE%2F%E5%8F%96%E6%89%B1%E5%95%86%E5%93%81%3A%0A%E6%9C%80%E9%80%9F%E5%88%A9%E7%94%A8%E5%B8%8C%E6%9C%9B%E6%99%82%E6%9C%9F%3A%0A%E3%81%94%E8%A6%81%E6%9C%9B%2F%E8%B3%AA%E5%95%8F%3A"
              >
                メールで先行登録
                <span aria-hidden="true">→</span>
              </a>
            </div>
            <a className="cs-mail" href="mailto:sales@nammoku-solutions.com">
              sales@nammoku-solutions.com
            </a>
          </div>
        </section>
      </main>

      <footer className="cs-footer">
        <div className="cs-container cs-footer-row">
          <div className="cs-footer-meta">
            © 2026 Stordex · Operated by Nammoku Solutions
          </div>
          <nav className="cs-footer-links" aria-label="フッターリンク">
            <a href="mailto:sales@nammoku-solutions.com">Contact</a>
            <a href="https://nammoku-solutions.com" rel="noopener">
              Nammoku Solutions
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
