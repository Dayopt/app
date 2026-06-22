// @dayopt/components — 共有 UI の単一 export 入口（内部は category 別に整理）

export { cn } from './cn';

// primitives
export { Badge, badgeVariants, type BadgeProps } from './primitives/badge';
export { Button, buttonVariants, type ButtonProps } from './primitives/button';
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './primitives/card';
export { Label } from './primitives/label';
export { Logo, type LogoProps } from './primitives/logo';
export { Separator } from './primitives/separator';
export { Spinner } from './primitives/spinner';
export { VisuallyHidden, type VisuallyHiddenProps } from './primitives/visually-hidden';

// forms
export { Checkbox } from './forms/checkbox';
export {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSupportText,
} from './forms/field';
export { InputOTP, InputOTPGroup, InputOTPSlot } from './forms/input-otp';
export { RadioGroup, RadioGroupItem } from './forms/radio-group';
export { Switch } from './forms/switch';

// feedback
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './feedback/alert-dialog';
export { InlineBanner, type InlineBannerAction } from './feedback/inline-banner';

// actions
export { ActionFooter } from './actions/action-footer';
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './actions/dropdown-menu';

// layout
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from './layout/collapsible';
export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './layout/drawer';
export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './layout/popover';
export { ScrollArea, ScrollBar } from './layout/scroll-area';
