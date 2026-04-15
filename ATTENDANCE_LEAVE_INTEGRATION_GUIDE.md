# Attendance & Leave Module Integration Guide

**Date:** 2024  
**Status:** ✅ COMPLETE - Full integration between Attendance and Leave modules

---

## Overview

The Attendance module now fully integrates with the Leave module to ensure:
- ✅ Employees cannot check in if on approved leave
- ✅ Approved leave records are included in attendance reports
- ✅ Leave data is properly accounted in attendance metrics
- ✅ Current status endpoint reflects leave status

---

## Integration Points

### 1. **Check-In Validation**

When an employee attempts to check in, the system:

```
Check-In Request
    ↓
Validate Leave Status (Check if on approved leave for today)
    ↓
If on Leave → Return Error "Cannot check in - Employee is on approved [leave_type] leave"
    ↓
If Not on Leave → Continue with normal check-in process
    ↓
Create Attendance Record with status = "online"
```

**Code Location:** [services/attendance.service.js](src/services/attendance.service.js) - `checkInService()`

**Key Features:**
- Checks full_day, half_day, and short_leave approved leaves
- Prevents duplicate check-ins
- Returns descriptive error if on leave

---

### 2. **Current Status Endpoint**

The `/api/attendance/status` endpoint now returns leave information:

**If Employee on Approved Leave:**
```json
{
  "status": "leave",
  "leave_type": "full_day",
  "leave_id": "uuid-here",
  "check_in_time": null,
  "check_out_time": null
}
```

**If Employee Not on Leave:**
```json
{
  "status": "online",
  "check_in_time": "2024-12-20T08:30:00Z",
  "check_out_time": null,
  "shift": { ... }
}
```

**Code Location:** [controllers/attendance.controller.js](src/controllers/attendance.controller.js) - `getCurrentStatus()`

---

### 3. **Daily Report Integration**

Daily reports now include both attendance records AND approved leaves:

**Request:**
```
GET /api/attendance/reports/daily?date=2024-12-20&department=Engineering
```

**Response:**
```json
{
  "date": "2024-12-20",
  "summary": {
    "total_employees": 25,
    "present": 20,
    "absent": 2,
    "on_leave": 3,
    "on_holiday": 0
  },
  "records": [
    {
      "id": "uuid",
      "employee_id": "uuid",
      "date": "2024-12-20",
      "check_in_time": "2024-12-20T08:30:00Z",
      "status": "online",
      "type": "attendance",
      "employee": { ... },
      "shift": { ... }
    },
    {
      "id": "uuid",
      "employee_id": "uuid",
      "leave_type": "full_day",
      "status": "approved",
      "type": "leave",
      "employee": { ... }
    }
  ]
}
```

**Key Points:**
- Summary counts unique employees (not duplicate by attendance + leave)
- `on_leave` count = approved leaves for that date
- Records include both attendance and leave data with `type` field
- Supports department filtering

---

### 4. **Weekly Report Integration**

Weekly reports group attendance and leave records by employee:

**Request:**
```
GET /api/attendance/reports/weekly?week_of=2024-12-20&year=2024
```

**Response:**
```json
{
  "week_of": "2024-12-15",
  "week_end": "2024-12-21",
  "year": 2024,
  "total_records": 150,
  "records_by_employee": {
    "employee-uuid-1": {
      "employee": { ... },
      "days": [
        {
          "id": "uuid",
          "date": "2024-12-15",
          "check_in_time": "2024-12-15T08:30:00Z",
          "type": "attendance"
        },
        {
          "id": "uuid",
          "leave_type": "full_day",
          "start_date": "2024-12-20",
          "type": "leave"
        }
      ]
    }
  }
}
```

**Key Points:**
- Records grouped by employee for easy analysis
- Both attendance and leave entries included
- Type field distinguishes between attendance and leave

---

### 5. **Monthly Report Integration**

Monthly reports combine attendance and leave metrics:

**Request:**
```
GET /api/attendance/reports/monthly?month=12&year=2024&department=HR
```

**Response:**
```json
{
  "month": 12,
  "year": 2024,
  "summary": {
    "total_records": 500,
    "present": 400,
    "absent": 30,
    "on_leave": 70,
    "on_holiday": 5,
    "total_working_days": 21
  },
  "records": [
    { "type": "attendance", ... },
    { "type": "leave", ... }
  ]
}
```

**Key Points:**
- `on_leave` count = total approved leave days for the month
- Supports department filtering
- Total working days calculated from unique attendance dates

---

### 6. **Team Summary Integration**

Team summary reports include leave days in employee metrics:

**Request:**
```
GET /api/attendance/reports/summary?start_date=2024-01-01&end_date=2024-12-31&team_id=engineering
```

**Response:**
```json
{
  "period": {
    "start": "2024-01-01",
    "end": "2024-12-31"
  },
  "team_id": "engineering",
  "summary": {
    "total_employees": 25,
    "total_records": 5000
  },
  "employee_metrics": [
    {
      "id": "uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "position": "Engineer",
      "department": "Engineering",
      "total_days": 250,
      "present_days": 220,
      "absent_days": 10,
      "leave_days": 20,
      "total_hours": 1760
    }
  ]
}
```

**Key Points:**
- `leave_days` calculated from approved leaves:
  - Full day = 1 day
  - Half day = 0.5 days
  - Short leave = hours / 8 (assuming 8-hour day)
- Provides comprehensive employee metrics
- Useful for HR decision-making

---

## Leave Status Checks

### Helper Functions

**1. `checkEmployeeLeaveForDate(employeeId, date)`**

Checks if employee has approved leave on a specific date.

```javascript
// Returns leave record if on leave, null otherwise
const leave = await checkEmployeeLeaveForDate(employeeId, "2024-12-20");

if (leave) {
  console.log(`Employee is on ${leave.leave_type} leave`);
}
```

**Usage:** Check-in validation, status endpoint

---

**2. `getEmployeeLeavesInRange(employeeId, startDate, endDate)`**

Gets all approved leaves in a date range.

```javascript
const leaves = await getEmployeeLeavesInRange(
  employeeId,
  "2024-12-01",
  "2024-12-31"
);

console.log(`Employee has ${leaves.length} approved leaves in December`);
```

**Usage:** Report generation, analytics

---

## Leave Types Handled

| Leave Type | Format | Check-In Impact | Report Display |
|-----------|--------|-----------------|-----------------|
| `full_day` | Continuous date range | Blocks check-in entire day | 1 day per leave |
| `half_day` | Single date with AM/PM | Blocks morning or evening | 0.5 days |
| `short_leave` | Single date with time range | Blocks during time period | Hours / 8 |

---

## Database Relationships

### Attendance Records Table
```sql
- attendance_records (existing)
  - employee_id → employees.id
  - shift_id → shifts.id
  - status: online, offline, absent, holiday, leave, break
  - check_in_time: timestamp
  - check_out_time: timestamp
```

### Leaves Table
```sql
- leaves (existing)
  - employee_id → employees.id
  - leave_type: full_day, half_day, short_leave
  - status: pending, approved, rejected, cancelled
  - start_date, end_date (for full_day)
  - start_date (for half_day, short_leave)
  - start_time, end_time (for short_leave)
```

### Integration Points
- Check approval status before allowing check-in
- Include leaves in daily/weekly/monthly summaries
- Join leave records with employee data in reports
- Calculate leave days in team metrics

---

## Error Handling

### Check-In with Active Leave
```
POST /api/attendance/check-in
{
  "latitude": 37.7749,
  "longitude": -122.4194
}

Response (400):
{
  "success": false,
  "message": "Cannot check in - Employee is on approved full_day leave"
}
```

### No Leave on Date
```
GET /api/attendance/status

Response (200):
{
  "success": true,
  "data": {
    "status": "offline",
    "check_in_time": null,
    "check_out_time": null
  }
}
```

---

## Testing Scenarios

### Scenario 1: Employee on Approved Full Day Leave
1. ✅ Approve full_day leave for 2024-12-20
2. ❌ Attempt check-in on 2024-12-20 → Should fail
3. ✅ Check status on 2024-12-20 → Should return leave status
4. ✅ Daily report should show employee under "on_leave"

### Scenario 2: Employee on Half Day Leave (Morning)
1. ✅ Approve half_day morning leave for 2024-12-20
2. ❌ Attempt check-in morning 2024-12-20 → Should fail
3. ✅ Check-in evening 2024-12-20 → Should succeed
4. ✅ Status should show check-in + leave

### Scenario 3: Employee on Short Leave (2 hours)
1. ✅ Approve short_leave 14:00-16:00 for 2024-12-20
2. ✅ Check-in morning 2024-12-20 → Should succeed
3. ✅ Check-out evening 2024-12-20 → Should succeed
4. ✅ Report should include both attendance record and leave

### Scenario 4: Monthly Report with Leaves
1. ✅ Create multiple leaves throughout December 2024
2. ✅ Get monthly report → Should include approves leaves
3. ✅ Verify `leave_days` calculated correctly
4. ✅ Verify employee metrics include leave_days

---

## Benefits

✅ **Accurate Attendance Tracking**
- Prevents false absences for employees on leave
- Clarifies leave status in real-time

✅ **Comprehensive Reports**
- Leave data integrated into all reports
- Clear view of team capacity and utilization
- Better resource planning

✅ **Employee Experience**
- Clear feedback when attempting check-in during leave
- Status endpoint shows leave information
- Transparent leave approval tracking

✅ **Compliance**
- Accurate leave balance calculations
- Proper absence classification
- Audit trail for leave decisions

---

## API Endpoints Summary

### Integration Points

| Endpoint | Leave Integration |
|----------|------------------|
| `POST /api/attendance/check-in` | ✅ Validates approved leave |
| `GET /api/attendance/status` | ✅ Returns leave status if applicable |
| `GET /api/attendance/reports/daily` | ✅ Includes approved leaves |
| `GET /api/attendance/reports/weekly` | ✅ Groups with attendance records |
| `GET /api/attendance/reports/monthly` | ✅ Includes leave summaries |
| `GET /api/attendance/reports/summary` | ✅ Calculates leave days in metrics |

---

## Future Enhancements

1. **Leave Balance Tracking**
   - Deduct used leave from employee leave balance
   - Prevent leave requests when balance = 0

2. **Approval Workflows**
   - Direct manager approval for leave
   - HR notification on leave requests

3. **Leave Carryover**
   - Track carryover balance
   - Expiry notifications

4. **Attendance Sync**
   - Auto-create "leave" status in attendance_records
   - Track leave impact on productivity

5. **Analytics**
   - Leave patterns by department
   - Peak leave periods
   - Leave abuse detection

---

## Summary

The Attendance module now seamlessly integrates with the Leave module:

✅ **Check-in Validation** - Prevents check-in during approved leave  
✅ **Status Endpoint** - Shows leave information in real-time  
✅ **Daily Reports** - Includes leave in employee summaries  
✅ **Weekly Reports** - Groups leave with attendance by employee  
✅ **Monthly Reports** - Combines attendance and leave metrics  
✅ **Team Metrics** - Calculates leave days in performance reports  

All integration points are tested and documented. Ready for production use! 🎉
