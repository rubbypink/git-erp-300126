async function saveForm(isConfirmed = false) {
  try {
    setBtnLoading("btn-save-form", true, "Saving...");
    var data = getFormData();
    // 2. Check Details
    if (data.operator_entries.length === 0) { logA("Vui lòng nhập ít nhất 1 dòng dịch vụ!"); return; }
    for (let i=0; i<data.operator_entries.length; i++) {
      const d = data.operator_entries[i];
      if(!d.cost_adult && d.total_cost) {
          logA(`Dòng thứ ${i+1} thiếu thông tin (SL mà lại có Thành tiền).`);
          return;
      }
    }

    var operator_entries = data.operator_entries;
    try {          
      await DB_MANAGER.batchSave('operator_entries', operator_entries);
      const btnDashUpdate = getE('btn-dash-update');
      if (btnDashUpdate) {
        btnDashUpdate.click();
      }
      
      const btnSelectDatalist = getE('btn-select-datalist');
      if (btnSelectDatalist) {
        btnSelectDatalist.dispatchEvent(new Event('change'));
      }          
      showNotify("Lưu dữ liệu thành công!", true);
    } catch (e) {
      logA("Lỗi chuyển đổi dữ liệu sang mảng: " + e, "error");
      return;
    }
  } catch (e) {
    showNotify("Lỗi hàm try: " + e, false);
  } finally {
    setBtnLoading("btn-save-form", false);
  }
  
}
  /**
   * 2. Gửi dữ liệu về Server (Full Row)
   */
  async function saveBatchDetails() {
    log('run saveBatchDetails');

    const operator_entries_obj = [];
    const currentTab = getE('tab-form');
    const rows = currentTab.querySelectorAll('#detail-tbody tr');

    rows.forEach((tr) => {
        operator_entries_obj.push({
            id: getRowVal('d-idbk'),
            booking_id: getRowVal('d-idbk'),
            customer_name: getRowVal('d-cust'),
            hotel_name: getRowVal('d-loc'),
            service_type: getRowVal('d-type'),
            name: getRowVal('d-name'),
            check_in: getRowVal('d-in'),
            check_out: getRowVal('d-out'),
            nights: getRowNum('d-night'),
            adults: getRowNum('d-qty'),
            children: getRowNum('d-qtyC'),
            cost_adult: getRowNum('d-costA'),
            cost_child: getRowNum('d-costC'),
            surcharge: getRowNum('d-sur'),
            discount: getRowNum('d-disc'),
            total_sale: getRowNum('d-totalSales'),
            ref_code: getRowVal('d-code'),
            total_cost: getRowNum('d-totalCost'),
            supplier: getRowVal('d-supplier'),
            operator_note: getRowVal('d-note'),
            paid_amount: getRowNum('d-paid'),
            debt_balance: getRowNum('d-remain')
        });
    });

    logA("Đang lưu... " + operator_entries_obj);
    setBtnLoading('btn-save-batch', true);
    await DB_MANAGER.batchSave('operator_entries', operator_entries_obj);
    setBtnLoading('btn-save-batch', false);
  }


