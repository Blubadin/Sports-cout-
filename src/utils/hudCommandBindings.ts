export type HudCommandMenu = "team" | "skill" | "area" | "result" | "foul";

export type HudCommandBinding = {
  menu: HudCommandMenu;
  keyCodes: string[];
  keyLabel: string;
  gamepadButtons: string[];
  title: string;
  holdInstruction: string;
  gamepadHint: string;
};

export const HUD_COMMAND_BINDINGS: Record<HudCommandMenu, HudCommandBinding> = {
  skill: {
    menu: "skill",
    keyCodes: ["KeyQ"],
    keyLabel: "Q",
    gamepadButtons: ["button-west"],
    title: "Skill Wheel",
    holdInstruction: "Hold Q, move pointer, release Q to select",
    gamepadHint: "Future gamepad: hold a face button, aim, release",
  },
  area: {
    menu: "area",
    keyCodes: ["KeyW"],
    keyLabel: "W",
    gamepadButtons: ["button-north"],
    title: "Area Wheel",
    holdInstruction: "Hold W, aim from center, release W to select",
    gamepadHint: "Future gamepad: hold a face button, aim the stick, release",
  },
  result: {
    menu: "result",
    keyCodes: ["KeyE"],
    keyLabel: "E",
    gamepadButtons: ["button-east"],
    title: "Result Wheel",
    holdInstruction: "Hold E, move pointer, release E to select",
    gamepadHint: "Future gamepad: hold a face button, aim, release",
  },
  foul: {
    menu: "foul",
    keyCodes: ["KeyF", "KeyR"],
    keyLabel: "F / R",
    gamepadButtons: ["left-shoulder", "right-shoulder"],
    title: "Foul Wheel",
    holdInstruction: "Hold F or R, move pointer, release to select",
    gamepadHint: "Future gamepad: hold a shoulder button, aim, release",
  },
  team: {
    menu: "team",
    keyCodes: ["Digit1", "Digit2"],
    keyLabel: "1 / 2",
    gamepadButtons: ["dpad-left", "dpad-right"],
    title: "Team Select",
    holdInstruction: "Hold 1 or 2, move pointer, release to confirm",
    gamepadHint: "Future gamepad: map teams to shoulder or d-pad",
  },
};

export function getHudMenuForKeyboardCode(code: string): HudCommandMenu | null {
  const binding = Object.values(HUD_COMMAND_BINDINGS).find((item) =>
    item.keyCodes.includes(code),
  );
  return binding?.menu ?? null;
}

export function getHudMenuForGamepadButton(buttonId: string): HudCommandMenu | null {
  const binding = Object.values(HUD_COMMAND_BINDINGS).find((item) =>
    item.gamepadButtons.includes(buttonId),
  );
  return binding?.menu ?? null;
}

export function getHudCommandKeyLabel(menu: string): string {
  return HUD_COMMAND_BINDINGS[menu as HudCommandMenu]?.keyLabel ?? "";
}

export function getHudCommandTitle(menu: string): string {
  return HUD_COMMAND_BINDINGS[menu as HudCommandMenu]?.title ?? "HUD Command";
}

export function getHudCommandInstruction(menu: string): string {
  return (
    HUD_COMMAND_BINDINGS[menu as HudCommandMenu]?.holdInstruction ??
    "Hold key, move pointer, release to select"
  );
}
