'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Icon } from '@/components/UI/Icon';
import styles from './DetailGallery.module.scss';

interface Props {
  images: readonly string[];
  alt: string;
}

export function DetailGallery({ images, alt }: Props) {
  const [index, setIndex] = useState(0);
  const many = images.length > 1;

  const go = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length);

  return (
    <div className={styles.gallery}>
      <div className={styles.main}>
        {images.map((src, i) => (
          <Image
            key={src}
            src={src}
            alt={i === 0 ? alt : `${alt} — photo ${i + 1}`}
            fill
            sizes='(max-width: 991px) 100vw, 920px'
            className={`${styles.image} ${i === index ? styles.active : ''}`}
            priority={i === 0}
          />
        ))}

        {many && (
          <>
            <span className={styles.counter}>
              {index + 1} / {images.length}
            </span>
            <button
              type='button'
              className={`${styles.arrow} ${styles.prev}`}
              onClick={() => go(-1)}
              aria-label='Previous photo'
            >
              <Icon name='chevron' />
            </button>
            <button
              type='button'
              className={`${styles.arrow} ${styles.next}`}
              onClick={() => go(1)}
              aria-label='Next photo'
            >
              <Icon name='chevron' />
            </button>
          </>
        )}
      </div>

      {many && (
        <div className={styles.thumbs}>
          {images.map((src, i) => (
            <button
              key={src}
              type='button'
              className={`${styles.thumb} ${i === index ? styles.thumbActive : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}`}
            >
              <Image src={src} alt='' fill sizes='160px' />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
