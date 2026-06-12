import React from 'react';
import './SpacerView.css';

export interface SpacerViewProps {
  orientation?: 'horizontal' | 'vertical';
  spacing?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SpacerView({ orientation = 'horizontal', spacing = 'md', className = '' }: SpacerViewProps) {
  return (
    <div
      className={`dui_spacer dui_spacer--${orientation} dui_spacer--${spacing}${className ? ` ${className}` : ''}`}
      role="separator"
      aria-hidden="true"
    />
  );
}
