async function saveForm(isConfirmed = false) {
  try {
    setBtnLoading("btn-save-form", true, "Saving...");
    var data = getFormData();
    // 2. Check Details
    if (data.operator_entries.length === 0) { logA("Vui lòng nhập ít nhất 1 dòng dịch vụ!"); return; }
    for (let i = 0; i < data.operator_entries.length; i++) {
      const d = data.operator_entries[i];
      if (!d.cost_adult && d.total_cost) {
        logA(`Dòng thứ ${i + 1} thiếu thông tin (SL mà lại có Thành tiền).`);
        return;
      }
    }

    var operator_entries = data.operator_entries;
    try {
      await A.DB.batchSave('operator_entries', operator_entries);
      if (window.StateProxy) StateProxy.commitSession(); // advance baseline, flush history
      const btnDashUpdate = getE('btn-dash-update');
      if (btnDashUpdate) {
        A.Event.trigger(btnDashUpdate, 'click');
      }

      const btnSelectDatalist = getE('btn-select-datalist');
      if (btnSelectDatalist) {
        btnSelectDatalist.dispatchEvent(new Event('change'));
      }
      logA("Lưu dữ liệu thành công!", true);
    } catch (e) {
      if (window.StateProxy) StateProxy.rollbackSession(); // revert to baseline
      logA("Lỗi chuyển đổi dữ liệu sang mảng: " + e, "error");
      return;
    }
  } catch (e) {
    logA("Lỗi hàm try: " + e, false);
  } finally {
    setBtnLoading("btn-save-form", false);
  }

}
/**
 * 2. Gửi dữ liệu về Server (Full Row)
 */
async function saveBatchDetails() {
  log('run saveBatchDetails');
  setBtnLoading('btn-save-batch', true);

  const data = await getTableData('tbl-booking-form');

  logA("Đang lưu... Dòng 1: " + data[0].values, "info");

  const res = await A.DB.batchSave('operator_entries', data);
  setBtnLoading('btn-save-batch', false);
  if (res) {
    logA('Lưu dữ liệu thành công!');
  }

}


