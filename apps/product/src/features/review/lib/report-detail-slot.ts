/**
 * DesktopLayout の 4 カラム目（右 250px）へ詳細パネルを portal するための DOM slot key。
 *
 * timeblock inspector（400px）とは**別の slot**にする。inspector（timeblock / L1）と
 * report detail（review / L2）は別ページに属し同時に開かないので、1 つの slot を共有すると
 * 「どちらを描くか」の調停ロジックを shell に置くことになる。その調停に価値が無く、幅も違う。
 * 3 つ目のパネルが要求された時点で汎用化を再検討する（#2581 の判断）。
 */
export const REPORT_DETAIL_SLOT_KEY = 'report-detail-panel';

/** 詳細パネルの幅（px）。inspector（400px）より狭い。リサイズは非対応。 */
export const REPORT_DETAIL_PANEL_WIDTH = 250;
