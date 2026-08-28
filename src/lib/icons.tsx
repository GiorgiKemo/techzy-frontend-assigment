import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ children, size = 18, ...props }: IconProps & { children: ReactNode }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>
}

export const GridIcon = (props: IconProps) => <Icon {...props}><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></Icon>
export const DoorIcon = (props: IconProps) => <Icon {...props}><path d="M5 20V4.8a1 1 0 0 1 .8-1l10-2A1 1 0 0 1 17 2.8V20"/><path d="M3 20h18M13 12h.01"/></Icon>
export const CalendarIcon = (props: IconProps) => <Icon {...props}><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 9h18M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/></Icon>
export const BookIcon = (props: IconProps) => <Icon {...props}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16M8 7h8M8 11h8"/></Icon>
export const PlusIcon = (props: IconProps) => <Icon {...props}><path d="M12 5v14M5 12h14"/></Icon>
export const SearchIcon = (props: IconProps) => <Icon {...props}><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></Icon>
export const SlidersIcon = (props: IconProps) => <Icon {...props}><path d="M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M11 16v4"/></Icon>
export const ChevronDownIcon = (props: IconProps) => <Icon {...props}><path d="m6 9 6 6 6-6"/></Icon>
export const ChevronLeftIcon = (props: IconProps) => <Icon {...props}><path d="m15 18-6-6 6-6"/></Icon>
export const ChevronRightIcon = (props: IconProps) => <Icon {...props}><path d="m9 18 6-6-6-6"/></Icon>
export const MoreIcon = (props: IconProps) => <Icon {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></Icon>
export const LogOutIcon = (props: IconProps) => <Icon {...props}><path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-5"/></Icon>
export const CloseIcon = (props: IconProps) => <Icon {...props}><path d="m6 6 12 12M18 6 6 18"/></Icon>
export const ArrowUpIcon = (props: IconProps) => <Icon {...props}><path d="M12 19V5M6 11l6-6 6 6"/></Icon>
export const ArrowDownIcon = (props: IconProps) => <Icon {...props}><path d="M12 5v14M18 13l-6 6-6-6"/></Icon>
export const UsersIcon = (props: IconProps) => <Icon {...props}><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM16 4.5a3.5 3.5 0 0 1 0 6.8M17 15a3.5 3.5 0 0 1 3 3.5V20"/></Icon>
export const MonitorIcon = (props: IconProps) => <Icon {...props}><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></Icon>
export const BoardIcon = (props: IconProps) => <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h4M7 16h7"/></Icon>
export const VideoIcon = (props: IconProps) => <Icon {...props}><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></Icon>
export const CheckIcon = (props: IconProps) => <Icon {...props}><path d="m5 12 4 4L19 6"/></Icon>
export const EditIcon = (props: IconProps) => <Icon {...props}><path d="m4 16-.8 4.8L8 20l11.3-11.3a2.1 2.1 0 0 0-3-3zM14.5 7.5l2 2"/></Icon>
export const TrashIcon = (props: IconProps) => <Icon {...props}><path d="M4 7h16M10 11v5M14 11v5M6 7l1 14h10l1-14M9 7V4h6v3"/></Icon>
export const ClockIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></Icon>
export const MapPinIcon = (props: IconProps) => <Icon {...props}><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></Icon>
export const SparkleIcon = (props: IconProps) => <Icon {...props}><path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4zM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6z"/></Icon>
export const MenuIcon = (props: IconProps) => <Icon {...props}><path d="M4 7h16M4 12h16M4 17h16"/></Icon>
