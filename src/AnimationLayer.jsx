import React, { useEffect, useState } from 'react';

const AnimationLayer = ({ animation, onAnimationComplete }) => {
  const [attackerNode, setAttackerNode] = useState(null);
  const [targetNode, setTargetNode] = useState(null);

  useEffect(() => {
    if (!animation) return;

    const { attackerId, targetId } = animation;

    // These selectors are brittle. A better approach would be to have stable IDs on the elements.
    // We'll add data-attributes for this.
    const attackerEl = document.querySelector(`[data-id='${attackerId}']`);
    const targetEl = document.querySelector(`[data-id='${targetId}']`);

    if (attackerEl && targetEl) {
      setAttackerNode(attackerEl);
      setTargetNode(targetEl);

      const handleAnimationEnd = () => {
        onAnimationComplete();
        setAttackerNode(null);
        setTargetNode(null);
      };

      attackerEl.addEventListener('animationend', handleAnimationEnd, { once: true });
    } else {
      // If we can't find the elements, just end the animation immediately.
      onAnimationComplete();
    }
  }, [animation, onAnimationComplete]);

  if (!animation || !attackerNode || !targetNode) {
    return null;
  }

  const attackerRect = attackerNode.getBoundingClientRect();
  const targetRect = targetNode.getBoundingClientRect();
  const boardRect = document.querySelector('.game-board').getBoundingClientRect();

  const startX = attackerRect.left - boardRect.left + attackerRect.width / 2;
  const startY = attackerRect.top - boardRect.top + attackerRect.height / 2;
  const endX = targetRect.left - boardRect.left + targetRect.width / 2;
  const endY = targetRect.top - boardRect.top + targetRect.height / 2;

  return (
    <div className="animation-layer">
      <div
        className="attack-animation"
        style={{
          '--start-x': `${startX}px`,
          '--start-y': `${startY}px`,
          '--end-x': `${endX}px`,
          '--end-y': `${endY}px`,
        }}
      />
    </div>
  );
};

export default AnimationLayer;
