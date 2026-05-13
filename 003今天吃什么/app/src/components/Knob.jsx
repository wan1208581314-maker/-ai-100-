import { motion } from "framer-motion";

export default function Knob({ spinning, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      className="relative rounded-full cursor-pointer outline-none border-none p-0"
      style={{
        width: 152,
        height: 152,
        background: `
          radial-gradient(circle at 35% 35%, #E8E8E8 0%, #C0C0C0 40%, #A0A0A0 70%, #888 100%)
        `,
        boxShadow: spinning
          ? "0 18px 34px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.38), 0 0 22px rgba(255,107,53,0.3)"
          : "0 18px 34px rgba(0,0,0,0.18), inset 0 2px 4px rgba(255,255,255,0.38)",
      }}
      animate={{
        rotate: spinning ? 75 : 0,
      }}
      transition={{
        type: "spring",
        stiffness: spinning ? 200 : 80,
        damping: spinning ? 20 : 15,
      }}
      whileTap={{ scale: 0.95 }}
    >
      {/* Metal ring */}
      <div
        className="absolute inset-2 rounded-full"
        style={{
          background: `
            conic-gradient(
              from 0deg,
              #D8D8D8 0deg,
              #B0B0B0 30deg,
              #E0E0E0 60deg,
              #A8A8A8 90deg,
              #D0D0D0 120deg,
              #B8B8B8 150deg,
              #E0E0E0 180deg,
              #A8A8A8 210deg,
              #D0D0D0 240deg,
              #B8B8B8 270deg,
              #E0E0E0 300deg,
              #B0B0B0 330deg,
              #D8D8D8 360deg
            )
          `,
          boxShadow: "inset 0 2px 6px rgba(0,0,0,0.15)",
        }}
      />

      {/* Inner circle */}
      <div
        className="absolute rounded-full"
        style={{
          inset: 20,
          background: "radial-gradient(circle at 40% 40%, #D0D0D0, #909090)",
          boxShadow: "inset 0 2px 8px rgba(0,0,0,0.2)",
        }}
      />

      {/* Handle bar */}
      <div
        className="absolute rounded-full"
        style={{
          width: 18,
          height: 96,
          left: "50%",
          top: 28,
          transform: "translateX(-50%)",
          background: "linear-gradient(to right, #F3F1EE, #BDB8B2 18%, #F8F7F5 50%, #AAA49D 82%, #EEECE8)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.32)",
          borderRadius: 9,
        }}
      />

      {/* Red dot */}
      <div
        className="absolute rounded-full"
        style={{
          width: 14,
          height: 14,
          left: "50%",
          top: 24,
          transform: "translateX(-50%)",
          background: "radial-gradient(circle at 40% 40%, #FF6B6B, #CC3333)",
          boxShadow: "0 1px 4px rgba(204,51,51,0.5), 0 0 8px rgba(255,100,100,0.3)",
        }}
      />
    </motion.button>
  );
}
