import { AccessibilityRole } from "react-native";

export function a11yButton(label: string, hint?: string) {
  return {
    accessible: true,
    accessibilityRole: "button" as AccessibilityRole,
    accessibilityLabel: label,
    ...(hint ? { accessibilityHint: hint } : {}),
  };
}

export function a11yTab(label: string, selected: boolean) {
  return {
    accessible: true,
    accessibilityRole: "tab" as AccessibilityRole,
    accessibilityLabel: label,
    accessibilityState: { selected },
  };
}

export function a11yLink(label: string, hint?: string) {
  return {
    accessible: true,
    accessibilityRole: "link" as AccessibilityRole,
    accessibilityLabel: label,
    ...(hint ? { accessibilityHint: hint } : {}),
  };
}

export function a11yGroup(label: string) {
  return {
    accessible: true,
    accessibilityRole: "summary" as AccessibilityRole,
    accessibilityLabel: label,
  };
}
