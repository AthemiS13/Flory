import Image from 'next/image'

export default function Sidebar(){
  return (
    <aside className="sidebar" style={{paddingTop:20, paddingBottom:20, justifyContent:'center'}}>
      <div style={{display:'flex',flexDirection:'column',gap:22,alignItems:'center'}}>
        <div className="round-btn" style={{width:56,height:56}}>
          <img src="/dashboard.svg" alt="dashboard" width={24} height={24} />
        </div>
        <div className="round-btn" style={{width:56,height:56}}>
          <img src="/settings.svg" alt="settings" width={24} height={24} />
        </div>
        <div className="round-btn" style={{width:56,height:56}}>
          <img src="/calibration.svg" alt="calib" width={24} height={24} />
        </div>
        <div className="round-btn" style={{width:56,height:56}}>
          <img src="/files.svg" alt="files" width={24} height={24} />
        </div>
      </div>
    </aside>
  )
}
