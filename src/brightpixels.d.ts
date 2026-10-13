import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'bright-text': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        color?: string;
        intensity?: string | number;
      };
    }
  }
}
