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
export { Container, type ContainerProps } from './primitives/container';
export { Label } from './primitives/label';
export { Logo, type LogoProps } from './primitives/logo';
export { Separator } from './primitives/separator';
export { Skeleton } from './primitives/skeleton';
export { Spinner } from './primitives/spinner';
export { Heading, Text, type HeadingProps, type TextProps } from './primitives/typography';
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
export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from './forms/form';
export { Input } from './forms/input';
export { InputOTP, InputOTPGroup, InputOTPSlot } from './forms/input-otp';
export { RadioGroup, RadioGroupItem } from './forms/radio-group';
export { Switch } from './forms/switch';
export { Textarea } from './forms/textarea';

// feedback
export { Alert, AlertDescription, AlertTitle } from './feedback/alert';
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
export { Toaster } from './feedback/sonner';

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
export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './layout/breadcrumb';
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
export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from './layout/pagination';
export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './layout/popover';
export { ScrollArea, ScrollBar } from './layout/scroll-area';
export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TabsTrigger as UnderlineTabsTrigger,
} from './layout/tabs';
