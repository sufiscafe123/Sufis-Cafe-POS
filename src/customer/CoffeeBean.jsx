// A coffee bean (oval with the centre crease) for stamps and dividers.
// `outline` draws an empty bean, e.g. for a stamp that is still pending.
export default function CoffeeBean({ size = 20, color = '#24503A', crease = '#F6F5EE', outline = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <g transform="rotate(-35 12 12)">
        <ellipse cx="12" cy="12" rx="6.6" ry="9.6" fill={outline ? 'none' : color} stroke={color} strokeWidth={outline ? 1.7 : 0} />
        <path d="M12.4 2.8c-2.7 2.9-2.7 5.6 0 9.2s2.7 6.3 0 9.2" fill="none" stroke={outline ? color : crease} strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
