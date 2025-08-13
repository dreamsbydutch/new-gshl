export const TeamScheduleHeader = () => {
  return (
    <div className="mx-auto mb-2 grid grid-cols-9 text-center font-varela text-xs font-semibold">
      <div className="">Week</div>
      <div className="col-span-6">Opponent</div>
      <div className="col-span-2">Score</div>
    </div>
  );
};
