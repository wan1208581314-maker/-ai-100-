import { motion } from "framer-motion";
import CustomFoodCard from "./CustomFoodCard";

export default function FoodCard({ food, width, height, isCenter, motionBlur = false }) {
  if (food.isCustom) {
    return (
      <motion.div
        className="food-card-frame"
        style={{
          width,
          height,
        }}
        animate={{
          scale: isCenter ? 1 : 0.88,
          opacity: motionBlur ? 0.6 : (isCenter ? 1 : 0.7),
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <CustomFoodCard food={food} width={width} height={height} motionBlur={motionBlur} />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="food-card-frame"
      style={{
        width,
        height,
      }}
      animate={{
        scale: isCenter ? 1 : 0.88,
        opacity: motionBlur ? 0.6 : (isCenter ? 1 : 0.7),
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <img
        src={food.image}
        alt=""
        className="w-full h-full object-cover"
        draggable={false}
        style={motionBlur ? { filter: "blur(3px)" } : undefined}
      />
    </motion.div>
  );
}
