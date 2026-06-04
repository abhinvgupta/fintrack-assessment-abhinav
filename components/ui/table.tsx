import { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react'

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={`w-full caption-bottom text-sm ${className ?? ''}`} {...props} />
}
export function TableHeader({ ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />
}
export function TableBody({ ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />
}
export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={`border-b transition-colors hover:bg-gray-50 ${className ?? ''}`} {...props} />
}
export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={`h-12 px-4 text-left align-middle font-medium text-gray-500 ${className ?? ''}`} {...props} />
}
export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`p-4 align-middle ${className ?? ''}`} {...props} />
}
