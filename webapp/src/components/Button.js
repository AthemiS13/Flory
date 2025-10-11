export default function Button({children, onClick}){
  return (
    <button onclick={onClick} style={{background:'#2b8cff',color:'#fff',border:'none',padding:'8px 12px',borderRadius:8,cursor:'pointer'}}>{children}</button>
  )
}
