import { useState } from 'react';
import { ModalView, ButtonView, CheckboxView } from '@salilvnair/dui';

interface ExportResponseOptionModalProps {
  open: boolean;
  /** Human-readable target format, e.g. "Daakia JSON", "Postman". */
  formatLabel: string;
  onConfirm: (includeResponse: boolean) => void;
  onCancel: () => void;
  accentColor?: string;
}

/** Asks whether to bundle each request's last saved response into the export —
 * mirrors what History already includes by default, but Collections only carry a
 * response if the user opted in here. */
export function ExportResponseOptionModal({ open, formatLabel, onConfirm, onCancel, accentColor }: ExportResponseOptionModalProps) {
  const [includeResponse, setIncludeResponse] = useState(false);

  return (
    <ModalView
      open={open}
      onClose={onCancel}
      title={`Export as ${formatLabel}`}
      size="sm"
      headerColor={accentColor}
      footerRight={
        <ButtonView
          variant="primary"
          size="sm"
          onClick={() => onConfirm(includeResponse)}
          style={accentColor ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
        >
          Export
        </ButtonView>
      }
    >
      <CheckboxView
        checked={includeResponse}
        onChange={setIncludeResponse}
        label="Include saved responses"
        size="md"
      />
      <p className="text-[11.5px] text-[var(--color-text-muted)] mt-2 leading-relaxed">
        Bundles each request's last saved response (status, headers, body) into the export file.
      </p>
    </ModalView>
  );
}
