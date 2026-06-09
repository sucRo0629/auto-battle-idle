/** クラス表示名（漢字 + 任意の英語肩書き） */
export interface ClassDisplayLabel {
  displayName: string;
  epithetEn?: string;
}

export function readClassDisplayLabel(
  preset: { displayName: string; epithetEn?: string } | undefined,
  classId: string,
): ClassDisplayLabel {
  if (!preset) {
    return { displayName: classId };
  }
  return {
    displayName: preset.displayName,
    epithetEn: preset.epithetEn,
  };
}
