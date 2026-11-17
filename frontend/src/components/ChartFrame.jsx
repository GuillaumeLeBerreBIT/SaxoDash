import { ResponsiveContainer } from 'recharts'

export default function ChartFrame({ className = '', label, placeholder, children, ...rest }) {
  const drawn = placeholder == null
  return (
    <div className={className} role={drawn && label ? 'img' : undefined} aria-label={drawn ? label : undefined} {...rest}>
      {drawn ? (
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      ) : (
        placeholder
      )}
    </div>
  )
}
