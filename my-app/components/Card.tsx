export default function Card({children, className='', center = true}:{children: React.ReactNode, className?: string, center?: boolean}){
  return <div className={`card ${className} ${center ? 'center-content' : ''}`}>{children}</div>
}
