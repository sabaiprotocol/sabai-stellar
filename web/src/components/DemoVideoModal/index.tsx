'use client';

import { Modal } from '@/components/UI/Modal';
import styles from './DemoVideoModal.module.scss';

interface Props {
  onClose: () => void;
}

/**
 * The recorded walkthrough, served from this deployment's own `public/`.
 *
 * Not an embed from a video host: this app makes no third-party request at
 * all, and a tracking iframe would be the only one on the page.
 */
export function DemoVideoModal({ onClose }: Props) {
  return (
    <Modal label='Watch the demo' width={1040} className={styles.modal} onClose={onClose}>
      {() => (
        <>
          <h2 className={styles.title}>The whole flow, in three minutes</h2>
          <p className={styles.subtitle}>
            Recorded against this deployment with the real Freighter extension: connect, top up from
            friendbot, pass the on-chain eligibility gate, buy, claim rent, sell back to the buyback
            pool, list on the secondary market, read the history — and the last transaction opened
            on a public explorer.
          </p>
          {/* biome-ignore lint/a11y/useMediaCaption: no speech to caption */}
          <video className={styles.video} controls autoPlay playsInline>
            {/* WebM first, so everything that can play it takes the smaller
                file; the H.264 copy is for Safari older than 14.1 on the
                desktop and 17.4 on iOS, which cannot decode VP9. */}
            <source src='/media/demo.webm' type='video/webm' />
            <source src='/media/demo.mp4' type='video/mp4' />
          </video>
        </>
      )}
    </Modal>
  );
}
