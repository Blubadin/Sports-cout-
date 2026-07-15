export type ControllerDeviceFamily = 'ps4' | 'ps5' | 'xbox' | 'generic';

export type ControllerButtonName =
  | 'button-south'
  | 'button-east'
  | 'button-west'
  | 'button-north'
  | 'left-shoulder'
  | 'right-shoulder'
  | 'left-trigger'
  | 'right-trigger'
  | 'view'
  | 'menu'
  | 'left-stick'
  | 'right-stick'
  | 'dpad-up'
  | 'dpad-down'
  | 'dpad-left'
  | 'dpad-right'
  | 'home';

export type ControllerCommandId =
  | 'openSkill'
  | 'openArea'
  | 'openResult'
  | 'openFoul'
  | 'previousTeam'
  | 'nextTeam'
  | 'undo'
  | 'redo'
  | 'saveEvent'
  | 'seekBackward'
  | 'seekForward'
  | 'togglePlayback'
  | 'toggleHistory'
  | 'bookmark'
  | 'confirm'
  | 'cancel';

export type ControllerCalibration = {
  deadzone: number;
  sensitivity: number;
  smoothing: number;
  activationThreshold: number;
  neutralCancelThreshold: number;
  sectorHysteresis: number;
};

export type ControllerProfile = {
  id: string;
  name: string;
  version: 1;
  deviceFamily: ControllerDeviceFamily;
  bindings: Partial<Record<ControllerCommandId, ControllerButtonName>>;
  calibration: ControllerCalibration;
  createdAt: string;
  updatedAt: string;
};

export type ControllerProfileEnvelope = {
  schemaVersion: '1.0';
  profiles: ControllerProfile[];
  activeProfileByFamily: Record<ControllerDeviceFamily, string>;
};

export type ControllerProfileExport = {
  schemaVersion: '1.0';
  type: 'sportscout-controller-profile';
  exportedAt: string;
  profile: ControllerProfile;
};

export type GamepadButtonSnapshot = {
  pressed: boolean;
  value: number;
};

export type GamepadSnapshot = {
  index: number;
  connected: boolean;
  id: string;
  mapping: string;
  buttons: readonly GamepadButtonSnapshot[];
  axes: readonly number[];
  timestamp?: number;
};

export type ActiveController = {
  index: number;
  family: ControllerDeviceFamily;
  mapping: 'standard' | 'generic';
};

type ControllerEventBase = {
  controllerIndex: number;
  family: ControllerDeviceFamily;
};

export type ControllerInputEvent =
  | (ControllerEventBase & {
      type: 'connected' | 'disconnected';
      mapping: 'standard' | 'generic';
    })
  | (ControllerEventBase & {
      type: 'button-down' | 'button-up' | 'button-repeat';
      control: ControllerButtonName;
      value: number;
    })
  | (ControllerEventBase & {
      type: 'axis-change';
      stick: 'left' | 'right';
      x: number;
      y: number;
      magnitude: number;
    })
  | (ControllerEventBase & {
      type: 'cancelled';
      reason: 'blur' | 'hidden' | 'disconnect' | 'disabled' | 'stopped';
    });
