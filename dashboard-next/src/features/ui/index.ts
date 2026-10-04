/**
 * The design system's public surface (04-02). Application code imports from '@/features/ui' only.
 * tokens.ts reads the resolved --dir-* custom properties of src/styles/tokens.css for the consumers
 * that cannot use var() (map paint, canvas, chart scales). Primitives are added here by later plans.
 * Nothing under src/features may import '@/components' (the feature fence).
 */
export { JS_TOKEN_KEYS, TokenError, findSurfaceRoot, readTokens, useTokens } from './tokens';
export type { TokenKey, Tokens } from './tokens';
export { useReducedMotion } from './motion';
export { Button, LinkButton } from './Button';
export type { ButtonProps, ButtonTone, ButtonVariant, LinkButtonProps } from './Button';
export { ToggleButton, ToggleGroup, ToggleGroupItem } from './ToggleGroup';
export type { ToggleButtonProps, ToggleGroupItemProps, ToggleGroupProps, ToggleTone } from './ToggleGroup';
export { AlertDialog, Dialog, DialogSurface } from './Dialog';
export type { AlertDialogProps, DialogProps, DialogSurfaceProps, OverlayBodyState } from './Dialog';
export { Listbox, ListboxItem, ListboxSection } from './Listbox';
export type { ListboxItemProps, ListboxProps, ListboxSectionProps, ListboxState } from './Listbox';
export { Sheet, SheetSurface } from './Sheet';
export type { SheetProps, SheetSide, SheetSurfaceProps } from './Sheet';
export { Cell, Column, Row, Table, TableBody, TableHeader } from './Table';
export type { CellProps, ColumnProps, RowProps, TableBodyProps, TableHeaderProps, TableProps } from './Table';
export { RangeSlider, Slider } from './Slider';
export type { RangeSliderProps, SliderForcedState, SliderProps, SliderState, SliderTone } from './Slider';
export { Tooltip, TooltipSurface } from './Tooltip';
export type { TooltipProps } from './Tooltip';
export { Skeleton } from './Skeleton';
export type { SkeletonProps, SkeletonSurface } from './Skeleton';
export { EmptyState } from './EmptyState';
export type { EmptyStateAction, EmptyStateProps } from './EmptyState';
export { ErrorState } from './ErrorState';
export type { ErrorStateProps } from './ErrorState';
export { LONG_WAIT_LABEL, LONG_WAIT_MS, LoadingState } from './LoadingState';
export type { LoadingStateProps } from './LoadingState';
export { StatusMark } from './StatusMark';
export type { StatusMarkProps } from './StatusMark';
export {
  HABITAT_STATUSES,
  STATUS_BG_CLASS,
  STATUS_FILL_CLASS,
  STATUS_LABELS,
  STATUS_PATH,
  STATUS_SHAPE,
  plotSymbol,
  statusColorVar,
} from './status-shapes';
export type { HabitatStatus, PlotStatusSymbol, StatusShape, SymbolContext } from './status-shapes';
