import { DEPLOYMENT, EXPLORER } from '@/lib/stellar';
import styles from './Footer.module.scss';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.disclaimerRow}>
        <p className={styles.disclaimer}>
          Testnet demo with a fictional asset — not an offer of securities. A production deployment
          would add a licensed KYC provider (SEP-12) and an incorporated company holding the
          property, whose membership interests these shares would be.
        </p>
      </div>
      <div className={styles.inner}>
        {/* A copyright line names the holder, which has to be a legal person -
            "Sabai Protocol" is the product. The entity here is the one the
            LICENSE and docs/LEGAL-STRUCTURE.md already name. */}
        <span className={styles.copy}>© 2026 Sabai Ecoverse Pte. Ltd. — Stellar Testnet PoC</span>
        <nav className={styles.links}>
          <a
            href={`${EXPLORER}/contract/${DEPLOYMENT.contracts.shareToken}`}
            target='_blank'
            rel='noreferrer'
          >
            Share token
          </a>
          <a
            href={`${EXPLORER}/contract/${DEPLOYMENT.contracts.assetSale}`}
            target='_blank'
            rel='noreferrer'
          >
            Sale contract
          </a>
          <a href='https://developers.stellar.org/docs/build' target='_blank' rel='noreferrer'>
            Built with Soroban
          </a>
        </nav>
      </div>
    </footer>
  );
}
