'use client';

import { useState } from 'react';
import { DocumentModal } from '@/components/DocumentModal';
import { Checkbox } from '@/components/UI/Checkbox';
import { CONSENT_DOCUMENT_IDS, type DemoDocument, DOCUMENTS } from '@/config/documents';

const CONSENT_DOCS = DOCUMENTS.filter((d) => CONSENT_DOCUMENT_IDS.includes(d.id));

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Sentence before the document links. */
  text?: string;
}

/** Consent line gating every trade; the document links open the reader
 *  in place instead of navigating away. */
export function ConsentCheck({
  checked,
  onChange,
  disabled = false,
  text = 'By continuing, I agree with the platform documents',
}: Props) {
  const [doc, setDoc] = useState<DemoDocument | null>(null);

  return (
    <>
      <Checkbox
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        label={
          <>
            {text}
            {': '}
            {CONSENT_DOCS.map((d, i) => (
              <span key={d.id}>
                <button
                  type='button'
                  onClick={(e) => {
                    // The label would otherwise toggle the checkbox too.
                    e.preventDefault();
                    setDoc(d);
                  }}
                >
                  {d.title}
                </button>
                {i < CONSENT_DOCS.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </>
        }
      />
      {doc && <DocumentModal document={doc} onClose={() => setDoc(null)} />}
    </>
  );
}
