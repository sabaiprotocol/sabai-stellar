'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Icon } from '@/components/UI/Icon';
import styles from './ImageGallery.module.scss';

interface Props {
  images: readonly string[];
  alt: string;
  priority?: boolean;
}

/* Sprite chevron centers exactly inside the circle (text glyphs sit on the
   font baseline and look off-center); the "next" arrow is rotated in CSS. */
const chevron = <Icon name='chevron' />;

/**
 * Card-header gallery: with a single image it renders plain, arrows and
 * dots appear from two images up.
 */
export function ImageGallery({ images, alt, priority = false }: Props) {
  const [index, setIndex] = useState(0);
  const many = images.length > 1;

  const go = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length);

  return (
    <div className={styles.gallery}>
      {images.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt={i === 0 ? alt : `${alt} — photo ${i + 1}`}
          fill
          priority={priority && i === 0}
          sizes='(max-width: 991px) 100vw, 660px'
          className={`${styles.image} ${i === index ? styles.active : ''}`}
        />
      ))}

      {many && (
        <>
          <button
            type='button'
            className={`${styles.arrow} ${styles.prev}`}
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label='Previous photo'
          >
            {chevron}
          </button>
          <button
            type='button'
            className={`${styles.arrow} ${styles.next}`}
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label='Next photo'
          >
            {chevron}
          </button>
          <div className={styles.dots}>
            {images.map((src, i) => (
              <button
                key={src}
                type='button'
                className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(i);
                }}
                aria-label={`Photo ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
