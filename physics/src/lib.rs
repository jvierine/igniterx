//! Flight and antenna model shared by native tests and the browser's WebAssembly module.
//! Coordinate frame: x downrange, y crossrange, z altitude, SI units.
use std::cell::RefCell;
use std::f64::consts::PI;
const C: f64 = 299_792_458.0;
const F: f64 = 868e6;
const LAMBDA: f64 = C / F;
const G: f64 = 9.80665;
const K: f64 = 1.380649e-23;
const SAMPLES: usize = 601;
pub const COLS: usize = 23;
pub const HEADER: usize = 34;
const BURN: f64 = 4.0;
const WET: f64 = 12.0;
const DRY: f64 = 8.0;
const MDOT: f64 = (WET - DRY) / BURN;
#[derive(Clone, Copy, Debug)]
pub struct V(pub f64, pub f64, pub f64);
impl V {
    fn add(self, v: V) -> V { V(self.0+v.0,self.1+v.1,self.2+v.2) }
    fn sub(self, v: V) -> V { V(self.0-v.0,self.1-v.1,self.2-v.2) }
    fn scale(self, s:f64)->V { V(self.0*s,self.1*s,self.2*s) }
    fn dot(self,v:V)->f64 {self.0*v.0+self.1*v.1+self.2*v.2}
    fn cross(self,v:V)->V {V(self.1*v.2-self.2*v.1,self.2*v.0-self.0*v.2,self.0*v.1-self.1*v.0)}
    fn norm(self)->f64 {self.dot(self).sqrt()}
    fn unit(self)->V {self.scale(1.0/self.norm().max(1e-12))}
}
fn db(v:f64)->f64 {10.0*v.max(1e-15).log10()}
fn bounded(v:f64,min:f64,max:f64,default:f64)->f64 { if v.is_finite(){v.clamp(min,max)}else{default} }
#[derive(Clone, Copy)]
pub struct Config {
    pub rx_spacing:f64, pub tx_spacing:f64, pub power_mw:f64, pub zenith:f64,
    pub aim:f64, pub temperature:f64, pub rate:f64, pub offset:f64,
    pub loss:f64, pub reserve:f64, pub tracking:bool, pub velocity_attitude:bool, pub roll:f64, pub tilts:[f64;3], pub azimuths:[f64;3], pub cp:f64,
}
impl Default for Config {
    fn default()->Self { Self{rx_spacing:0.5,tx_spacing:0.35,power_mw:25.0,zenith:20.0,aim:0.38,temperature:273.0,rate:2400.0,offset:300.0,loss:2.0,reserve:3.0,tracking:false,velocity_attitude:false,roll:0.0,tilts:[0.0;3],azimuths:[0.0,120.0,240.0],cp:1.0} }
}
#[derive(Clone,Copy)]
pub struct Flight {pub axis:V,pub ve:f64,pub apogee_t:f64,pub end:f64}
#[derive(Clone,Copy)]
pub struct State {pub p:V,pub v:V,pub mass:f64}
impl Flight {
    pub fn new(zenith:f64)->Self {
        let angle=zenith.to_radians(); let axis=V(angle.sin(),0.0,angle.cos());
        let mut low=50.0; let mut high=3000.0;
        for _ in 0..64 {
            let ve=(low+high)/2.0;
            let z=ve*(BURN-DRY/MDOT*(WET/DRY).ln())*axis.2-0.5*G*BURN*BURN;
            let vz=ve*(WET/DRY).ln()*axis.2-G*BURN;
            if z+vz.max(0.0).powi(2)/(2.0*G)>3000.0 {high=ve;}else{low=ve;}
        }
        let ve=(low+high)/2.0;
        let z=ve*(BURN-DRY/MDOT*(WET/DRY).ln())*axis.2-0.5*G*BURN*BURN;
        let vz=ve*(WET/DRY).ln()*axis.2-G*BURN;
        Self{axis,ve,apogee_t:BURN+vz/G,end:BURN+(vz+(vz*vz+2.0*G*z).sqrt())/G}
    }
    pub fn at(self,t:f64)->State {
        let t=t.clamp(0.0,self.end); let tb=t.min(BURN); let m=WET-MDOT*tb;
        let impulse=self.ve*(WET/m).ln();
        let p_b=self.axis.scale(self.ve*(tb-m/MDOT*(WET/m).ln())).add(V(0.0,0.0,-0.5*G*tb*tb));
        let v_b=self.axis.scale(impulse).add(V(0.0,0.0,-G*tb));
        let coast=(t-BURN).max(0.0);
        State{p:p_b.add(v_b.scale(coast)).add(V(0.0,0.0,-0.5*G*coast*coast)),v:v_b.add(V(0.0,0.0,-G*coast)),mass:m}
    }
}
/// Coherent vector fields of three independently oriented half-wave dipoles.
fn tx_fields(theta:f64,phi:f64,spacing:f64,tilts:[f64;3],azimuths:[f64;3])->(V,V) {
    let direction=V(theta.sin()*phi.cos(),theta.sin()*phi.sin(),theta.cos());
    let mut re=V(0.0,0.0,0.0);let mut im=re;
    for i in 0..3 {
        let t=tilts[i].to_radians();let a=azimuths[i].to_radians();
        let axis=V(t.sin()*a.cos(),t.sin()*a.sin(),t.cos());
        let cosine=axis.dot(direction).clamp(-1.0,1.0);let sin2=1.0-cosine*cosine;
        if sin2<1e-14 {continue;}
        // Transverse polarization vector times the half-wave dipole field envelope.
        let field=axis.sub(direction.scale(cosine)).scale((0.5*PI*cosine).cos()/sin2/3.0_f64.sqrt());
        let position_angle=2.0*PI*i as f64/3.0;
        let phase=2.0*PI*spacing/3.0_f64.sqrt()*theta.sin()*(phi-position_angle).cos();
        re=re.add(field.scale(phase.cos()));im=im.add(field.scale(phase.sin()));
    }(re,im)
}
fn tx_oriented(theta:f64,phi:f64,spacing:f64,tilts:[f64;3],azimuths:[f64;3])->f64 {
    let (re,im)=tx_fields(theta,phi,spacing,tilts,azimuths);re.dot(re)+im.dot(im)
}
fn tx_raw(theta:f64,phi:f64,spacing:f64)->f64 {tx_oriented(theta,phi,spacing,[0.0;3],[0.0;3])}
fn cp_fraction(theta:f64,phi:f64,spacing:f64,tilts:[f64;3],azimuths:[f64;3],hand:f64)->f64 {
    let (re,im)=tx_fields(theta,phi,spacing,tilts,azimuths);let total=re.dot(re)+im.dot(im);
    if total<1e-28{return 0.5;}
    let et=V(theta.cos()*phi.cos(),theta.cos()*phi.sin(),-theta.sin());let ep=V(-phi.sin(),phi.cos(),0.0);
    let ar=re.dot(et);let ai=im.dot(et);let br=re.dot(ep);let bi=im.dot(ep);
    (0.5*((ar-hand*bi).powi(2)+(ai+hand*br).powi(2))/total).clamp(0.0,1.0)
}
/// Spherical integration normalizes to fixed total radiated power.
fn tx_normalization_oriented(spacing:f64,tilts:[f64;3],azimuths:[f64;3])->(f64,f64) {
    let nt=100;let np=144;let mut integral=0.0;let mut peak:f64=0.0;
    for ti in 0..nt {let theta=PI*(ti as f64+0.5)/nt as f64;
        for pi in 0..np {let phi=2.0*PI*(pi as f64+0.5)/np as f64;let raw=tx_oriented(theta,phi,spacing,tilts,azimuths); integral+=raw*theta.sin(); peak=peak.max(raw);}
    }
    let norm=integral*PI/(2.0*(nt*np) as f64); (norm,db(peak/norm))
}
#[cfg(test)]
fn tx_normalization(spacing:f64)->(f64,f64) {tx_normalization_oriented(spacing,[0.0;3],[0.0;3])}
fn basis(normal:V)->(V,V) {
    let helper=if normal.2.abs()>0.95 {V(0.0,1.0,0.0)}else{V(0.0,0.0,1.0)};
    let u=helper.cross(normal).unit();(u,normal.cross(u).unit())
}
fn tx_angles(direction:V,axis:V,roll:f64)->(f64,f64) {
    let (u,v)=basis(axis); (direction.dot(axis).clamp(-1.0,1.0).acos(),direction.dot(v).atan2(direction.dot(u))-roll)
}
fn patch_power(cosine:f64)->f64 {10.0_f64.powf(5.5/10.0)*cosine.max(0.0).powi(2)}
/// |sum weights*voltages|^2/N: ideal independent receiver noise gives N, not N^2.
fn rx_af(direction:V,steer:V,normal:V,spacing:f64)->f64 {
    let (u,v)=basis(normal);let delta=direction.sub(steer);
    let a=2.0*PI*spacing*delta.dot(u);let b=2.0*PI*spacing*delta.dot(v);
    (1.0+2.0*a.cos()+2.0*b.cos()).powi(2)/5.0
}
#[derive(Clone,Copy)]
pub struct Modem {pub sf:i32,pub bw:f64,pub rate:f64,pub snr:f64,pub noise:f64,pub sensitivity:f64}
fn modem(rate:f64,temp:f64,reserve:f64)->Modem {
    let bandwidths=[7800.0,10400.0,15600.0,20800.0,31250.0,41700.0,62500.0,125000.0,250000.0,500000.0];
    let mut best=Modem{sf:6,bw:500000.0,rate:37500.0,snr:-5.0,noise:10.0*(K*temp*500000.0).log10()+30.0,sensitivity:0.0};
    let mut best_s=f64::INFINITY;
    for sf in 6..=12 {for bw in bandwidths {
        let rb=sf as f64*bw/(2.0_f64.powi(sf))*0.8;
        if rb+1e-6<rate{continue;}
        let snr=10.0-2.5*sf as f64;let noise=10.0*(K*temp*bw).log10()+30.0;let sensitivity=noise+snr+reserve;
        if sensitivity<best_s { best_s=sensitivity;best=Modem{sf,bw,rate:rb,snr,noise,sensitivity}; }
    }}best
}
fn fspl(range:f64)->f64 {20.0*(4.0*PI*range.max(1.0)/LAMBDA).log10()}
fn trajectory_average(values:&[f64])->f64 {
    (values.iter().sum::<f64>()-0.5*(values[0]+values[values.len()-1]))/(values.len()-1) as f64
}
pub fn simulate(c:Config)->Vec<f64> {
    let flight=Flight::new(c.zenith);let rx=V(-c.offset,150.0,2.0);
    let (norm,tx_peak)=tx_normalization_oriented(c.tx_spacing,c.tilts,c.azimuths);let mode=modem(c.rate,c.temperature,c.reserve);
    let states:Vec<State>=(0..SAMPLES).map(|i|flight.at(i as f64*flight.end/(SAMPLES-1) as f64)).collect();
    let directions:Vec<V>=states.iter().map(|s|s.p.sub(rx).unit()).collect();
    let mut pol_losses=Vec::new();
    let tx_gains:Vec<f64>=states.iter().zip(directions.iter()).map(|(s,d)|{
        let axis=if c.velocity_attitude && s.v.norm()>1.0{s.v.unit()}else{flight.axis};
        let (theta,phi)=tx_angles(d.scale(-1.0),axis,c.roll.to_radians());pol_losses.push(-db(cp_fraction(theta,phi,c.tx_spacing,c.tilts,c.azimuths,c.cp)));db(tx_oriented(theta,phi,c.tx_spacing,c.tilts,c.azimuths)/norm)
    }).collect();
    let mut aim=c.aim;
    if aim<0.0 {
        let mut best=f64::NEG_INFINITY;
        // Mechanical maximin optimization constrained to aim points on the flight path.
        for j in 0..=100 {
            let fraction=j as f64/100.0;let n=flight.at(flight.end*fraction).p.sub(rx).unit();
            let mut worst=f64::INFINITY;
            for (i,s) in states.iter().enumerate() {
                let d=directions[i];let steer=if c.tracking{d}else{n};
                let margin=db(c.power_mw)+tx_gains[i]+db(patch_power(d.dot(n))*rx_af(d,steer,n,c.rx_spacing))-fspl(s.p.sub(rx).norm())-pol_losses[i]-c.loss-mode.sensitivity;
                worst=worst.min(margin);
            }
            if worst>best {best=worst;aim=fraction;}
        }
    }
    let normal=flight.at(flight.end*aim).p.sub(rx).unit();
    let mut out=vec![0.0;HEADER]; let mut bm=Vec::new();let mut sm=Vec::new();let mut ok_time=0.0;
    let mut previous=0.0;
    for (i,s) in states.iter().enumerate() {
        let t=i as f64*flight.end/(SAMPLES-1) as f64; let direction=directions[i];let range=s.p.sub(rx).norm();
        let single=db(patch_power(direction.dot(normal)));let steer=if c.tracking{direction}else{normal};
        let beam=db(patch_power(direction.dot(normal))*rx_af(direction,steer,normal,c.rx_spacing));
        let path=fspl(range);let pr=db(c.power_mw)+tx_gains[i]+single-path-pol_losses[i]-c.loss;
        let prb=db(c.power_mw)+tx_gains[i]+beam-path-pol_losses[i]-c.loss;
        let margin=prb-mode.sensitivity;
        if i>0 {
            // Fraction of each linearized sample interval above the 0 dB threshold.
            let fraction=if previous>=0.0 && margin>=0.0 {1.0}else if previous<0.0 && margin<0.0 {0.0}else if previous>=0.0 {previous/(previous-margin)}else{margin/(margin-previous)};
            ok_time+=fraction*flight.end/(SAMPLES-1) as f64;
        }
        previous=margin;bm.push(margin);sm.push(pr-mode.sensitivity);
        let doppler=-s.v.dot(direction)/LAMBDA;
        out.extend_from_slice(&[t,s.p.0,s.p.1,s.p.2.max(0.0),s.v.0,s.v.1,s.v.2,s.mass,if t<BURN{1.0}else{0.0},range,tx_gains[i],single,beam,path,pr,prb,mode.noise,mode.sensitivity,pr-mode.sensitivity,margin,doppler,direction.dot(normal).clamp(-1.0,1.0).acos().to_degrees(),pol_losses[i]]);
    }
    let values=[1.0,SAMPLES as f64,COLS as f64,BURN,flight.apogee_t,flight.end,flight.ve,MDOT,normal.2.clamp(-1.0,1.0).acos().to_degrees(),normal.1.atan2(normal.0).to_degrees(),aim,trajectory_average(&bm),bm.iter().copied().fold(f64::INFINITY,f64::min),bm.iter().copied().fold(f64::NEG_INFINITY,f64::max),ok_time/flight.end*100.0,trajectory_average(&sm),sm.iter().copied().fold(f64::INFINITY,f64::min),LAMBDA,mode.sf as f64,mode.bw,mode.rate,mode.snr,mode.sensitivity,mode.noise,db(c.power_mw),tx_peak,rx.0,rx.1,rx.2,norm,c.rx_spacing*LAMBDA,c.tx_spacing*LAMBDA,3000.0,c.reserve];
    out[..HEADER].copy_from_slice(&values);out
}
thread_local!{ static OUTPUT:RefCell<Vec<f64>>=const {RefCell::new(Vec::new())}; }
/// Stable numeric ABI. Header and column layout documented in src/model.ts.
#[no_mangle]
pub extern "C" fn calculate(rx_spacing:f64,tx_spacing:f64,power_mw:f64,zenith:f64,aim:f64,temperature:f64,rate:f64,offset:f64,loss:f64,reserve:f64,tracking:i32,velocity_attitude:i32,roll:f64,t1:f64,a1:f64,t2:f64,a2:f64,t3:f64,a3:f64,cp:f64) {
    let config=Config {
        rx_spacing:bounded(rx_spacing,0.5,2.0,0.5),tx_spacing:bounded(tx_spacing,0.05,1.0,0.35),power_mw:bounded(power_mw,1.0,500.0,25.0),zenith:bounded(zenith,0.0,60.0,20.0),aim:bounded(aim,-1.0,1.0,0.38),temperature:bounded(temperature,100.0,10000.0,273.0),rate:bounded(rate,18.3,37500.0,2400.0),offset:bounded(offset,100.0,2000.0,300.0),loss:bounded(loss,0.0,15.0,2.0),reserve:bounded(reserve,0.0,15.0,3.0),tracking:tracking!=0,velocity_attitude:velocity_attitude!=0,roll:bounded(roll,0.0,120.0,0.0),tilts:[bounded(t1,0.0,180.0,0.0),bounded(t2,0.0,180.0,0.0),bounded(t3,0.0,180.0,0.0)],azimuths:[bounded(a1,0.0,360.0,0.0),bounded(a2,0.0,360.0,120.0),bounded(a3,0.0,360.0,240.0)],cp:if cp<0.0{-1.0}else{1.0},
    };
    let output=simulate(config);OUTPUT.with(|v|*v.borrow_mut()=output);
}
#[no_mangle]pub extern "C" fn output_ptr()->*const f64 {OUTPUT.with(|v|v.borrow().as_ptr())}
#[no_mangle]pub extern "C" fn output_len()->usize {OUTPUT.with(|v|v.borrow().len())}
#[no_mangle]pub extern "C" fn tx_pattern(theta:f64,phi:f64,spacing:f64,normalization:f64)->f64 {db(tx_raw(theta,phi,spacing)/normalization)}
#[no_mangle]pub extern "C" fn tx_pattern_oriented(theta:f64,phi:f64,spacing:f64,norm:f64,t1:f64,a1:f64,t2:f64,a2:f64,t3:f64,a3:f64)->f64 {db(tx_oriented(theta,phi,spacing,[t1,t2,t3],[a1,a2,a3])/norm)}
/// Local patch plane basis, normal at +z. steer_x/z parameterize an elevation cut.
/// Array-only SNR gain; does not include the element envelope.
#[no_mangle]pub extern "C" fn rx_array_factor(theta:f64,phi:f64,spacing:f64,sx:f64,sy:f64,_sz:f64)->f64 {
    let d=V(theta.sin()*phi.cos(),theta.sin()*phi.sin(),theta.cos());
    let a=2.0*PI*spacing*(d.0-sx);let b=2.0*PI*spacing*(d.1-sy);
    db((1.0+2.0*a.cos()+2.0*b.cos()).powi(2)/5.0)
}
#[no_mangle]pub extern "C" fn single_dipole(theta:f64)->f64 {
    let sint=theta.sin();if sint.abs()<1e-8{return -150.0;}
    db(1.640922*(0.5*PI*theta.cos()).cos().powi(2)/(sint*sint))
}
#[no_mangle]pub extern "C" fn rx_pattern(theta:f64,phi:f64,spacing:f64,steer_x:f64,steer_y:f64,steer_z:f64,beam:i32)->f64 {
    let d=V(theta.sin()*phi.cos(),theta.sin()*phi.sin(),theta.cos());let patch=patch_power(d.2);
    if beam==0 {return db(patch);}
    let delta=d.sub(V(steer_x,steer_y,steer_z));
    let af=(1.0+2.0*(2.0*PI*spacing*delta.0).cos()+2.0*(2.0*PI*spacing*delta.1).cos()).powi(2)/5.0;
    db(patch*af)
}
#[cfg(test)]mod tests {
    use super::*;
    #[test]fn vector_fields_recover_parallel_scalar_pattern(){
        for theta in [0.3,0.9,PI/2.0,2.5] {for phi in [0.0,0.7,2.3] {
            let element=(0.5*PI*theta.cos()).cos().powi(2)/theta.sin().powi(2);let mut re=0.0;let mut im=0.0;
            for i in 0..3 {let phase=2.0*PI*0.35/3.0_f64.sqrt()*theta.sin()*(phi-2.0*PI*i as f64/3.0).cos();re+=phase.cos();im+=phase.sin();}
            assert!((tx_raw(theta,phi,0.35)-element*(re*re+im*im)/3.0).abs()<1e-12);
            assert!((cp_fraction(theta,phi,0.35,[0.0;3],[0.0;3],1.0)-0.5).abs()<1e-12);
        }}
    }
    #[test]fn differing_orientations_remove_shared_axial_null(){
        assert!(tx_oriented(0.0,0.0,0.35,[0.0,90.0,90.0],[0.0,0.0,90.0])>0.6);
        let t=0.8;let p=1.2;let tilts=[20.0,70.0,90.0];let az=[0.0,120.0,240.0];
        let a=cp_fraction(t,p,0.35,tilts,az,1.0);let b=cp_fraction(t,p,0.35,tilts,az,-1.0);assert!((a+b-1.0).abs()<1e-12);
        let (norm,_)=tx_normalization_oriented(0.35,tilts,az);let mut integral=0.0;
        for i in 0..160 {let theta=PI*(i as f64+0.5)/160.0;for j in 0..200 {integral+=tx_oriented(theta,2.0*PI*(j as f64+0.5)/200.0,0.35,tilts,az)*theta.sin()/norm;}}
        assert!((integral*PI/(2.0*160.0*200.0)-1.0).abs()<0.001);
    }
    #[test]fn calibrated_apogee_and_landing(){for angle in [0.0,20.0,45.0,60.0]{let f=Flight::new(angle);assert!((f.at(f.apogee_t).p.2-3000.0).abs()<1e-6);assert!(f.at(f.apogee_t).v.2.abs()<1e-8);assert!(f.at(f.end).p.2.abs()<1e-6);assert!(f.at(BURN).v.2>0.0);}}
    #[test]fn burn_continuity_and_mass(){let f=Flight::new(20.0);let a=f.at(BURN-1e-7);let b=f.at(BURN+1e-7);assert!(a.p.sub(b.p).norm()<1e-3);assert!(a.v.sub(b.v).norm()<1e-3);assert_eq!(f.at(0.0).mass,12.0);assert_eq!(f.at(10.0).mass,8.0);}
    #[test]fn friis_range_scaling(){assert!((fspl(2000.0)-fspl(1000.0)-6.020599913).abs()<1e-7);}
    #[test]fn array_snr_gain(){let n=V(0.0,0.0,1.0);assert!((db(rx_af(n,n,n,0.5))-6.98970004).abs()<1e-7);assert!((db(patch_power(1.0))-5.5).abs()<1e-8);}
    #[test]fn tx_nulls_and_normalization(){assert_eq!(tx_raw(0.0,0.0,0.5),0.0);assert_eq!(tx_raw(PI,0.0,0.5),0.0);let (_,peak)=tx_normalization(0.0001);assert!((peak-2.15).abs()<0.04);for spacing in [0.05,0.5,1.0]{let (n,_)=tx_normalization(spacing);let mut mean=0.0;for t in 0..160{let theta=PI*(t as f64+0.5)/160.0;for p in 0..200{mean+=tx_raw(theta,2.0*PI*(p as f64+0.5)/200.0,spacing)/n*theta.sin();}}mean*=PI/(2.0*160.0*200.0);assert!((mean-1.0).abs()<0.001);}}
    #[test]fn power_and_noise_deltas(){let c=Config::default();let a=simulate(c);let b=simulate(Config{power_mw:50.0,..c});let d=simulate(Config{temperature:546.0,..c});assert!((b[11]-a[11]-3.0102999566).abs()<1e-7);assert!((d[11]-a[11]+3.0102999566).abs()<1e-7);}
    #[test]fn tracking_and_aim_maximize_gain(){let c=Config{tracking:true,..Config::default()};let o=simulate(c);for row in o[HEADER..].chunks(COLS){assert!((row[12]-row[11]-db(5.0)).abs()<1e-8);}let f=Flight::new(c.zenith);let n=f.at(f.end*c.aim).p.sub(V(-c.offset,150.0,2.0)).unit();assert!((db(patch_power(n.dot(n)))-5.5).abs()<1e-8);}
    #[test]fn triangular_array_has_longitudinal_interference_nulls(){
        // For phi=90deg, AF = (1 + 2*cos(pi*d*sin(theta)))^2/3.
        // At d=lambda, theta=asin(2/3) cancels all three fields, away from the axial dipole null.
        let theta=(2.0_f64/3.0).asin();assert!(tx_raw(theta,PI/2.0,1.0)<1e-25);
        assert!(single_dipole(theta)>-5.0);
        let (n,_)=tx_normalization(1.0);assert!(tx_pattern(theta,PI/2.0,1.0,n)< -140.0);
        assert!(tx_pattern(theta,0.0,1.0,n)>-10.0);
    }
    #[test]fn patch_envelope_has_no_array_nulls(){
        let d=1.0;let theta=((-0.25_f64).acos()/(2.0*PI*d/2.0_f64.sqrt())).asin();
        assert!(rx_pattern(theta,PI/4.0,d,0.0,0.0,1.0,1)< -140.0);
        assert!(rx_pattern(theta,PI/4.0,d,0.0,0.0,1.0,0)>3.0);
        let halfwidth=PI/4.0;assert!((rx_pattern(halfwidth,0.0,d,0.0,0.0,1.0,0)-5.5+3.0102999566).abs()<1e-7);
    }
    #[test]fn grating_lobe_at_two_wavelength_spacing(){
        // Replica at sin(theta)=lambda/d, equal AF but element attenuation remains.
        let theta=(0.5_f64).asin();let af=rx_array_factor(theta,0.0,2.0,0.0,0.0,1.0);
        assert!((af-db(5.0)).abs()<1e-8);
        let gain=rx_pattern(theta,0.0,2.0,0.0,0.0,1.0,1);
        assert!((gain-(5.5+db(5.0)+db(0.75))).abs()<1e-8);
        let halfway=rx_array_factor((0.25_f64).asin(),0.0,2.0,0.0,0.0,1.0);
        assert!(halfway<af-10.0);
    }
    #[test]fn lora_rate_requirement(){for rate in [18.3,100.0,2400.0,10000.0,37500.0]{let m=modem(rate,273.0,3.0);assert!(m.rate>=rate);assert!(m.sensitivity.is_finite());}}
    #[test]fn optimizer_improves_worst_margin(){let c=Config::default();let a=simulate(c);let b=simulate(Config{aim:-1.0,..c});assert!(b[12]>=a[12]-0.05);assert!((0.0..=1.0).contains(&b[10]));}
}
