type StrokeWidthIconProps = {
  width: number;
};

function StrokeWidthIcon({ width }: StrokeWidthIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      fill="none"
    >
      <path
        d="M5 19L19 5"
        stroke="currentcolor"
        strokeWidth={width}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default StrokeWidthIcon;
