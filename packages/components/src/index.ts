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
export { VisuallyHidden, type VisuallyHiddenProps } from './primitives/visually-hidden';

// forms
export { RadioGroup, RadioGroupItem } from './forms/radio-group';
export { Switch } from './forms/switch';

// actions
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
