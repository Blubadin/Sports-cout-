import { useEffect, useRef, useState } from 'react';

interface ScreenMarkingOptions {
  enabled: boolean;
  activationKey: string; // 'Alt' | 'Control' | 'Shift'
  onSelectTeam: (value: string) => void;
  onSelectSkill: (value: string) => void;
  onSelectArea: (code: string, courtSide?: 'teamA' | 'teamB' | 'neutral') => void;
  onSelectResult: (value: string) => void;
  onSelectDescriptor: (groupId: string, value: string) => void;
}

export function useScreenMarkingMode({
  enabled,
  activationKey,
  onSelectTeam,
  onSelectSkill,
  onSelectArea,
  onSelectResult,
  onSelectDescriptor,
}: ScreenMarkingOptions) {
  const [isActive, setIsActive] = useState(false);
  const pointerPos = useRef({ x: 0, y: 0 });
  const currentHovered = useRef<HTMLElement | null>(null);
  const isKeyPressed = useRef(false);

  const isInputFocused = () => {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName.toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      active.hasAttribute('contenteditable') ||
      active.closest('dialog') !== null
    );
  };

  const clearHighlight = () => {
    if (currentHovered.current) {
      currentHovered.current.removeAttribute('data-scout-hovered');
      currentHovered.current = null;
    }
  };

  const updateHoveredElement = (x: number, y: number) => {
    if (!isKeyPressed.current) return;
    
    // Find the element at pointer
    const el = document.elementFromPoint(x, y);
    const selectable = el?.closest('[data-scout-selectable="true"]') as HTMLElement | null;

    if (selectable !== currentHovered.current) {
      clearHighlight();
      if (selectable) {
        selectable.setAttribute('data-scout-hovered', 'true');
        currentHovered.current = selectable;
      }
    }
  };

  useEffect(() => {
    if (!enabled) {
      if (isActive) {
        setIsActive(false);
        document.body.classList.remove('scout-marking-active');
        clearHighlight();
        isKeyPressed.current = false;
      }
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      pointerPos.current = { x: e.clientX, y: e.clientY };
      if (isKeyPressed.current) {
        updateHoveredElement(e.clientX, e.clientY);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      const isTargetKey = 
        (activationKey === 'Alt' && e.key === 'Alt') ||
        (activationKey === 'Control' && e.key === 'Control') ||
        (activationKey === 'Shift' && e.key === 'Shift');

      if (isTargetKey && !isKeyPressed.current) {
        e.preventDefault();
        isKeyPressed.current = true;
        setIsActive(true);
        document.body.classList.add('scout-marking-active');
        // Check element immediately under cursor
        updateHoveredElement(pointerPos.current.x, pointerPos.current.y);
      }

      if (e.key === 'Escape' && isKeyPressed.current) {
        // Cancel screen marking mode
        e.preventDefault();
        isKeyPressed.current = false;
        setIsActive(false);
        document.body.classList.remove('scout-marking-active');
        clearHighlight();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const isTargetKey = 
        (activationKey === 'Alt' && e.key === 'Alt') ||
        (activationKey === 'Control' && e.key === 'Control') ||
        (activationKey === 'Shift' && e.key === 'Shift');

      if (isTargetKey && isKeyPressed.current) {
        e.preventDefault();
        isKeyPressed.current = false;
        setIsActive(false);
        document.body.classList.remove('scout-marking-active');

        // Execute choice if we have a hovered element
        if (currentHovered.current) {
          const group = currentHovered.current.getAttribute('data-scout-group');
          const value = currentHovered.current.getAttribute('data-scout-value') || '';
          
          if (group === 'team') {
            onSelectTeam(value);
          } else if (group === 'skill') {
            onSelectSkill(value);
          } else if (group === 'area') {
            const courtSide = currentHovered.current.getAttribute('data-court-side') as 'teamA' | 'teamB' | 'neutral' | undefined;
            onSelectArea(value, courtSide);
          } else if (group === 'result') {
            onSelectResult(value);
          } else if (group === 'descriptor') {
            const descGroup = currentHovered.current.getAttribute('data-descriptor-group') || '';
            onSelectDescriptor(descGroup, value);
          }
        }

        clearHighlight();
      }
    };

    const handleBlur = () => {
      // Safely reset on window blur
      isKeyPressed.current = false;
      setIsActive(false);
      document.body.classList.remove('scout-marking-active');
      clearHighlight();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('blur', handleBlur);
      document.body.classList.remove('scout-marking-active');
      if (currentHovered.current) {
        currentHovered.current.removeAttribute('data-scout-hovered');
      }
    };
  }, [
    enabled,
    activationKey,
    onSelectTeam,
    onSelectSkill,
    onSelectArea,
    onSelectResult,
    onSelectDescriptor,
    isActive,
  ]);

  return { isActive };
}
