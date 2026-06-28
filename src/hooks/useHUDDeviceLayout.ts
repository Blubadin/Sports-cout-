import { useState, useEffect } from 'react';

export type HUDDeviceLayout = {
  device: 'mobile' | 'tablet' | 'desktop';
  orientation: 'portrait' | 'landscape';
  isCoarsePointer: boolean;
  skillWheelSize: number;
  skillButtonSize: number;
  subSkillButtonSize: number;
  touchTarget: number;
  areaMode: 'compact' | 'expanded';
  resultRailMode: 'compact' | 'normal';
  videoControlsMode: 'compact' | 'expanded';
};

export function useHUDDeviceLayout(): HUDDeviceLayout {
  const [layout, setLayout] = useState<HUDDeviceLayout>({
    device: 'desktop',
    orientation: 'landscape',
    isCoarsePointer: false,
    skillWheelSize: 300,
    skillButtonSize: 48,
    subSkillButtonSize: 44,
    touchTarget: 44,
    areaMode: 'expanded',
    resultRailMode: 'normal',
    videoControlsMode: 'expanded',
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const orientation = width > height ? 'landscape' : 'portrait';
      
      // Check for touch pointer
      const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
      
      // Determine device category
      let device: 'mobile' | 'tablet' | 'desktop' = 'desktop';
      
      if (isCoarsePointer) {
        if (Math.min(width, height) < 500) {
          device = 'mobile';
        } else if (Math.min(width, height) < 900) {
          device = 'tablet';
        } else {
          device = 'desktop';
        }
      } else {
        // Fallback to width/height checks if fine pointer
        if (width < 768 || (orientation === 'landscape' && width < 960 && height < 500)) {
          device = 'mobile';
        } else if (width < 1200) {
          device = 'tablet';
        } else {
          device = 'desktop';
        }
      }

      // Compute sizing parameters based on device & orientation
      let skillWheelSize = 300;
      let skillButtonSize = 48;
      let subSkillButtonSize = 44;
      let touchTarget = 44;
      let areaMode: 'compact' | 'expanded' = 'expanded';
      let resultRailMode: 'compact' | 'normal' = 'normal';
      let videoControlsMode: 'compact' | 'expanded' = 'expanded';

      if (device === 'mobile') {
        areaMode = 'compact';
        resultRailMode = 'compact';
        videoControlsMode = 'compact';
        touchTarget = 48;

        if (orientation === 'portrait') {
          skillWheelSize = 230;
          skillButtonSize = 58;
          subSkillButtonSize = 50;
        } else {
          skillWheelSize = 230;
          skillButtonSize = 54;
          subSkillButtonSize = 48;
        }
      } else if (device === 'tablet') {
        areaMode = 'expanded';
        resultRailMode = 'normal';
        videoControlsMode = 'compact';
        touchTarget = 48;
        skillWheelSize = 280;
        skillButtonSize = 56;
        subSkillButtonSize = 52;
      } else {
        // Desktop
        areaMode = 'expanded';
        resultRailMode = 'normal';
        videoControlsMode = 'expanded';
        touchTarget = 44;
        skillWheelSize = 310;
        skillButtonSize = 48;
        subSkillButtonSize = 46;
      }

      setLayout({
        device,
        orientation,
        isCoarsePointer,
        skillWheelSize,
        skillButtonSize,
        subSkillButtonSize,
        touchTarget,
        areaMode,
        resultRailMode,
        videoControlsMode,
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return layout;
}
