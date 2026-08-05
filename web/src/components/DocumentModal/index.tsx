'use client';

import { Modal } from '@/components/UI/Modal';
import type { DemoDocument } from '@/config/documents';
import styles from './DocumentModal.module.scss';

interface Props {
  document: DemoDocument;
  onClose: () => void;
}

/** Reader for a demo document, opened on top of whatever screen you were on. */
export function DocumentModal({ document: doc, onClose }: Props) {
  return (
    <Modal label={doc.title} width={1000} className={styles.modal} onClose={onClose}>
      <h2 className={styles.title}>{doc.title}</h2>
      <p className={styles.subtitle}>{doc.kind}</p>

      <div className={styles.doc}>
        {doc.sections.map((section, i) => (
          <section key={section.heading ?? `section-${i}`} className={styles.section}>
            {section.heading && <h3 className={styles.heading}>{section.heading}</h3>}
            {section.paragraphs?.map((p) => (
              <p key={p} className={styles.paragraph}>
                {p}
              </p>
            ))}
            {section.list && (
              <ul className={styles.list}>
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <p className={styles.note}>
        Demo document — describes this testnet proof of concept, not a legal record of any property.
      </p>
    </Modal>
  );
}
