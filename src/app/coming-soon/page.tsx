import type { Metadata } from "next";
import "./coming-soon.css";

export const metadata: Metadata = {
  title: "Stordex — 受発注・在庫管理クラウド（近日公開）",
  description:
    "Stordex は、物流・卸売業向けの受発注・在庫・請求書管理を一元化するクラウド SaaS です。近日公開。",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Stordex — 受発注・在庫管理クラウド",
    description:
      "受発注・在庫・請求書を、ひとつのクラウドで。物流・卸売業のための B2B SaaS。近日公開。",
    type: "website",
    url: "https://stordex.jp/",
  },
};

export default function ComingSoonPage() {
  return (
    <div className="cs-root">
      <div className="bg-fx" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="site">
        <div className="container site-row">
          <a className="logo" href="/" aria-label="Stordex">
            <span className="logo-mark">S</span>
            <span>Stordex</span>
          </a>
          <span className="badge">
            <span className="dot" />
            Coming Soon · 2026
          </span>
        </div>
      </header>

      <main>
        <section className="hero container" aria-labelledby="hero-title">
          <p className="eyebrow">For wholesale &amp; logistics</p>
          <h1 id="hero-title">
            Stordex<span className="accent">.</span>
          </h1>
          <p className="tagline">受発注・在庫・請求書を、ひとつのクラウドで。</p>
          <p className="lead">
            紙とExcelで回していた受発注・在庫・請求の業務を、ブラウザ一枚で完結。
            物流・卸売業の現場のために設計された、シンプルな B2B SaaS。
          </p>
          <div className="cta">
            <a
              className="btn btn-primary"
              href="mailto:sales@nammoku-solutions.com?subject=Stordex%20%E5%85%88%E8%A1%8C%E7%99%BB%E9%8C%B2&body=%E4%BC%9A%E7%A4%BE%E5%90%8D%3A%0A%E3%81%94%E6%8B%85%E5%BD%93%E8%80%85%E3%81%8A%E5%90%8D%E5%89%8D%3A%0A%E6%A5%AD%E7%A8%AE%2F%E5%8F%96%E6%89%B1%E5%95%86%E5%93%81%3A%0A%E6%9C%80%E9%80%9F%E5%88%A9%E7%94%A8%E5%B8%8C%E6%9C%9B%E6%99%82%E6%9C%9F%3A%0A%E3%81%94%E8%A6%81%E6%9C%9B%2F%E8%B3%AA%E5%95%8F%3A"
            >
              先行登録する →
            </a>
            <a className="btn btn-ghost" href="#features">
              特長を見る
            </a>
          </div>
        </section>

        <section className="block" id="features" aria-labelledby="features-title">
          <div className="container">
            <p className="eyebrow">What you get</p>
            <h2 id="features-title" className="section-title">
              業務の流れを、まるごと一枚に。
            </h2>
            <p className="section-lead">
              受注から出荷、在庫の引き当て、請求書発行までを一気通貫で。
              現場のExcelとFAX運用を、そのままWebに置き換えます。
            </p>
            <div className="what-grid">
              <div className="what-card">
                <div className="ico">O</div>
                <h3>受発注管理</h3>
                <p>得意先からの注文・仕入先への発注を、見積・受注・出荷までステータス管理。</p>
              </div>
              <div className="what-card">
                <div className="ico">I</div>
                <h3>在庫管理</h3>
                <p>商品マスタと入出庫を直結。受注時に自動で引き当て、在庫切れを未然に検知。</p>
              </div>
              <div className="what-card">
                <div className="ico">B</div>
                <h3>請求書発行</h3>
                <p>受注データから請求書をワンクリック生成。A4印刷・PDF保存にそのまま対応。</p>
              </div>
              <div className="what-card">
                <div className="ico">A</div>
                <h3>分析ダッシュボード</h3>
                <p>得意先別・商品別の売上動向を可視化。Excelに頼らず即座に意思決定できる。</p>
              </div>
            </div>
          </div>
        </section>

        <section className="block" id="audience" aria-labelledby="audience-title">
          <div className="container">
            <p className="eyebrow">For who</p>
            <h2 id="audience-title" className="section-title">
              こんな現場へ。
            </h2>
            <div className="audience">
              <div className="audience-item">
                <strong>卸売業</strong>
                <span>得意先からの注文を電話・FAXで受け、手書きで在庫を管理している。</span>
              </div>
              <div className="audience-item">
                <strong>物流・倉庫業</strong>
                <span>入出庫の記録と請求書発行をExcelで二重管理している。</span>
              </div>
              <div className="audience-item">
                <strong>製造業</strong>
                <span>部品の発注と在庫の同期に時間がかかっている。</span>
              </div>
              <div className="audience-item">
                <strong>従業員 5〜30 名</strong>
                <span>専任の情シスはいないが、業務はクラウドで効率化したい。</span>
              </div>
            </div>
          </div>
        </section>

        <section className="block" id="how" aria-labelledby="how-title">
          <div className="container">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title" className="section-title">
              シンプルな B2B 契約。
            </h2>
            <p className="section-lead">
              企業間契約・月額制でご提供します。料金プラン・初期費用については、貴社の業務規模に応じて個別にお見積りいたします。
            </p>
            <div className="how-list">
              <div className="how-step">
                <span className="how-num">01</span>
                <div>
                  <h3>お問い合わせ</h3>
                  <p>メールにてご相談ください。現在の業務フローをヒアリングします。</p>
                </div>
              </div>
              <div className="how-step">
                <span className="how-num">02</span>
                <div>
                  <h3>デモ・お見積り</h3>
                  <p>オンラインでデモをご覧いただき、月額料金をご提示します。</p>
                </div>
              </div>
              <div className="how-step">
                <span className="how-num">03</span>
                <div>
                  <h3>導入</h3>
                  <p>マスタデータ移行のサポート付き。最短 1 週間で運用開始できます。</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="contact container" id="contact" aria-labelledby="contact-title">
          <p className="eyebrow">Get in touch</p>
          <h2 id="contact-title">業務改善の最初の一歩、ご相談ください。</h2>
          <p>
            先行登録・デモ依頼・お見積り・パートナーシップに関するご相談はメールで。原則 2 営業日以内に返信いたします。
          </p>
          <a
            className="btn btn-primary"
            href="mailto:sales@nammoku-solutions.com?subject=Stordex%20%E5%85%88%E8%A1%8C%E7%99%BB%E9%8C%B2&body=%E4%BC%9A%E7%A4%BE%E5%90%8D%3A%0A%E3%81%94%E6%8B%85%E5%BD%93%E8%80%85%E3%81%8A%E5%90%8D%E5%89%8D%3A%0A%E6%A5%AD%E7%A8%AE%2F%E5%8F%96%E6%89%B1%E5%95%86%E5%93%81%3A%0A%E6%9C%80%E9%80%9F%E5%88%A9%E7%94%A8%E5%B8%8C%E6%9C%9B%E6%99%82%E6%9C%9F%3A%0A%E3%81%94%E8%A6%81%E6%9C%9B%2F%E8%B3%AA%E5%95%8F%3A"
          >
            メールで先行登録 →
          </a>
          <div style={{ marginTop: 14 }}>
            <a className="mail" href="mailto:sales@nammoku-solutions.com">
              sales@nammoku-solutions.com
            </a>
          </div>
        </section>
      </main>

      <footer className="site">
        <div className="container foot-row">
          <div>© 2026 Stordex · Operated by Nammoku Solutions</div>
          <div className="foot-links">
            <a href="mailto:sales@nammoku-solutions.com">Contact</a>
            <a href="https://nammoku-solutions.com" rel="noopener">
              Nammoku Solutions
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
