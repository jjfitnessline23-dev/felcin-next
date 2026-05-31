export default function FelcinLogo({ size = 32 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size}>
      <rect width="64" height="64" rx="14" fill="#080808"/>
      <path d="M 12 32 A 20 20 0 0 0 52 32 L 52 50 Q 46 57 40 50 Q 32 57 24 50 Q 18 57 12 50 Z" fill="white"/>
      <circle cx="24" cy="29" r="4.5" fill="#080808"/>
      <circle cx="40" cy="29" r="4.5" fill="#080808"/>
      <path d="M 0,36 L 14,36 L 16,34 L 18,36 L 20,36 L 21,38 L 24,20 L 27,39 L 30,34 L 32,36 C 34,36 35,31 37,36 L 64,36"
        fill="none" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  );
}
