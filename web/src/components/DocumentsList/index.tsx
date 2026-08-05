'use client';

import { Icon } from '@/components/UI/Icon';
import type { DemoDocument } from '@/config/documents';
import styles from './DocumentsList.module.scss';

interface Props {
  documents: DemoDocument[];
  onOpen: (doc: DemoDocument) => void;
}

/** The asset's documents; a row opens the reader, it never downloads. */
export function DocumentsList({ documents, onOpen }: Props) {
  return (
    <div className={styles.list}>
      {documents.map((doc) => (
        <button key={doc.id} type='button' className={styles.row} onClick={() => onOpen(doc)}>
          <Icon name='doc' />
          <span className={styles.body}>
            <span className={styles.title}>{doc.title}</span>
            <span className={styles.kind}>{doc.kind}</span>
          </span>
          <Icon name='download' />
        </button>
      ))}
    </div>
  );
}
