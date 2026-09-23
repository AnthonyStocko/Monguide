export default function IconField({ icon: Icon, id, label, ...inputProps }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor={id}>{label}</label>
      <div className="relative">
        <Icon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          id={id}
          className="w-full border rounded-md pl-10 pr-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          {...inputProps}
        />
      </div>
    </div>
  );
}
