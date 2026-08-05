import type { IconName } from '@/assets/sprite/types';

interface Props {
  name: IconName;
  className?: string;
}

/** Sprite icon -
 *  size and color come from the surrounding CSS (currentColor). */
export function Icon({ name, className }: Props) {
  return (
    <svg role='img' aria-label={name} {...(className && { className })}>
      <use href={`/sprite.svg#${name}`} />
    </svg>
  );
}
