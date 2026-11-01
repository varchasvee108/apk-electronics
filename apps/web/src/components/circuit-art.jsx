import { useId } from "react";

export function CircuitArt({ variant = "led", large = false }) {
  const id = useId().replace(/:/g, "");
  const wave = variant === "wave" || variant === "filter";
  const digital = variant === "digital";
  return (
    <svg
      className={`circuit-art ${large ? "large" : ""}`}
      viewBox="0 0 440 230"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={`dots${id}`}
          width="16"
          height="16"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="1" fill="currentColor" opacity=".13" />
        </pattern>
        <filter id={`glow${id}`}>
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>
      <rect width="440" height="230" fill={`url(#dots${id})`} />
      {wave ? (
        <>
          <rect x="58" y="34" width="324" height="162" rx="12" fill="#172f31" />
          <path
            d="M76 76H364M76 115H364M76 154H364M124 50V180M188 50V180M252 50V180M316 50V180"
            stroke="#345054"
            strokeWidth="1"
          />
          <path
            d="M77 116C98 38 122 38 143 116S188 194 209 116S253 38 275 116S321 194 343 116"
            fill="none"
            stroke="#93e0c3"
            strokeWidth="3"
          />
          <path
            d="M77 128C100 85 122 85 143 128S188 171 209 128S253 85 275 128S321 171 343 128"
            fill="none"
            stroke="#edb562"
            strokeWidth="2"
          />
          <circle cx="360" cy="48" r="3" fill="#93e0c3" />
        </>
      ) : (
        <>
          <rect
            x="76"
            y="48"
            width="286"
            height="148"
            rx="12"
            fill="#fff"
            stroke="#d7ded5"
            strokeWidth="2"
          />
          <path d="M90 64H346M90 180H346" stroke="#e99b91" strokeWidth="2" />
          <path d="M90 72H346M90 172H346" stroke="#8cb7cd" strokeWidth="2" />
          {Array.from({ length: 20 }, (_, x) =>
            Array.from({ length: 6 }, (_, y) => (
              <circle
                key={`${x}-${y}`}
                cx={96 + x * 13}
                cy={86 + y * 14 + (y >= 3 ? 10 : 0)}
                r="2"
                fill="#d5dcd5"
              />
            )),
          )}
          <path
            d="M122 64V100H184M243 142H315V172"
            fill="none"
            stroke="#d97b6d"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M188 100V143H245"
            fill="none"
            stroke="#479a88"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          {digital ? (
            <>
              <rect
                x="166"
                y="97"
                width="85"
                height="48"
                rx="4"
                fill="#273739"
              />
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <path
                  key={n}
                  d={`M${175 + n * 13} 87V97M${175 + n * 13} 145V155`}
                  stroke="#81918c"
                  strokeWidth="4"
                />
              ))}
              <text
                x="208"
                y="125"
                fill="#d9e7de"
                fontSize="13"
                fontFamily="monospace"
                textAnchor="middle"
              >
                NE555
              </text>
            </>
          ) : (
            <>
              <path d="M151 100H211" stroke="#909b91" strokeWidth="3" />
              <rect
                x="164"
                y="92"
                width="36"
                height="16"
                rx="5"
                fill="#daba86"
              />
              {["#b47741", "#665584", "#b54d45", "#bc9c4b"].map((c, i) => (
                <path
                  key={c}
                  d={`M${170 + i * 7} 93V107`}
                  stroke={c}
                  strokeWidth="3"
                />
              ))}
              <path
                d="M239 117V142M254 117V142"
                stroke="#94a19a"
                strokeWidth="3"
              />
              <circle
                cx="247"
                cy="112"
                r="19"
                fill="#e9ab67"
                opacity=".5"
                filter={`url(#glow${id})`}
              />
              <path
                d="M235 120V109A12 12 0 0 1 259 109V120Z"
                fill="#eaaa65"
                stroke="#d08945"
                strokeWidth="1.5"
              />
              <path
                d="M240 107Q243 101 249 102"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                opacity=".7"
              />
            </>
          )}
          <rect x="27" y="93" width="33" height="66" rx="5" fill="#344848" />
          <rect x="27" y="93" width="33" height="21" rx="4" fill="#c6a573" />
          <text
            x="43"
            y="138"
            fill="#e8eee6"
            fontSize="12"
            fontFamily="monospace"
            textAnchor="middle"
          >
            9V
          </text>
          <path
            d="M37 93V64H122M50 93V172H95"
            fill="none"
            stroke="#4f796f"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </>
      )}
      {large && (
        <>
          <g transform="translate(305 17) rotate(7)">
            <rect
              width="112"
              height="37"
              rx="10"
              fill="#fff"
              stroke="#e1e7dc"
            />
            <circle cx="16" cy="18" r="4" fill="#328c72" />
            <text
              x="28"
              y="23"
              fontSize="11"
              fill="#34524a"
              fontFamily="sans-serif"
            >
              Ideas, electrified.
            </text>
          </g>
          <g transform="translate(18 184) rotate(-5)">
            <rect
              width="125"
              height="35"
              rx="10"
              fill="#fff"
              stroke="#e1e7dc"
            />
            <text
              x="14"
              y="22"
              fontSize="11"
              fill="#34524a"
              fontFamily="monospace"
            >
              V = I × R
            </text>
            <circle cx="105" cy="17" r="5" fill="#e7b76e" />
          </g>
        </>
      )}
    </svg>
  );
}
export function artVariant(example) {
  if (
    example.tags?.some((t) =>
      ["scope", "AC", "filter", "rectifier"].includes(t),
    )
  )
    return "wave";
  if (
    example.tags?.some((t) =>
      ["555", "logic", "digital", "Arduino"].includes(t),
    )
  )
    return "digital";
  return "led";
}
