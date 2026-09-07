interface Props {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}

/** A stable 48px touch target; the thumb moves only inside its track. */
export default function Toggle({ checked, onChange, label, disabled = false }: Props) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      disabled={disabled} onClick={onChange} className="control-switch">
      <span className="control-switch-track" aria-hidden="true"><span className="control-switch-thumb" /></span>
    </button>
  );
}
