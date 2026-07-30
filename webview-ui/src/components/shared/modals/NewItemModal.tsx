import { useState, useEffect, useRef } from 'react';
import { ModalView, ButtonView, TextInputView } from '@salilvnair/dui';

interface NewItemModalProps {
  open: boolean;
  title: string;
  placeholder?: string;
  onSave: (name: string) => void;
  onCancel: () => void;
  accentColor?: string;
}

export function NewItemModal({ open, title, placeholder = '', onSave, onCancel, accentColor }: NewItemModalProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSave(trimmed);
      setValue('');
    }
  };

  return (
    <ModalView
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      headerColor={accentColor}
      footerRight={
        <ButtonView
          variant="primary"
          size="sm"
          disabled={!value.trim()}
          onClick={handleSave}
          style={accentColor ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
        >
          Save
        </ButtonView>
      }
    >
      <TextInputView
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
        placeholder={placeholder || 'Enter name'}
        size="md"
        width="fw"
      />
    </ModalView>
  );
}
