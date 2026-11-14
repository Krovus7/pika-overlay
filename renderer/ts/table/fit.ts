/** Which columns fit in a given width: the rightmost go first, the player column never. */

export interface FitResult<T> {
    shown: T[];
    hiddenCount: number;
}

export function fitColumns<T extends { id: string }>(
    cols: readonly T[],
    availableWidth: number,
    widthOf: (col: T) => number,
    playerMinWidth: number,
): FitResult<T> {
    const widthSum = (list: readonly T[]): number =>
        list.reduce((sum, col) => sum + (col.id === 'player' ? playerMinWidth : widthOf(col)), 0);

    const shown = [...cols];
    while (widthSum(shown) > availableWidth) {
        let droppable = shown.length - 1;
        while (droppable >= 0 && shown[droppable]!.id === 'player') droppable--;
        if (droppable < 0) break;
        shown.splice(droppable, 1);
    }
    return { shown, hiddenCount: cols.length - shown.length };
}
