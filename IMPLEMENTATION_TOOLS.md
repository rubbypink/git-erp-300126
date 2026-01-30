# ⚙️ IMPLEMENTATION TOOLS & CHECKLISTS

**Tools, templates, and checklists for executing Phase 1-4**

**V2 Rule**: Build all new code in **public/v2**. **public/src (v1)** is read-only.

---

## 📋 PHASE 1 WEEKLY CHECKLIST

### Week 1: Format Cleanup

**Monday-Tuesday: Remove Array Format**
- [ ] Update db_manager.js (remove array collections)
- [ ] Create db_transformer.js with DataTransformer class
- [ ] Search & remove all array index references (bkData[0], etc.)
- [ ] Remove format detection code from utils.js
- [ ] Verify in console: No `APP_DATA.bookings` array
- [ ] **Test**: Load booking from Firestore → should be object

**Wednesday-Thursday: Update Collections**
- [ ] Update logic_operator.js - replace array access with object access
- [ ] Update logic_sales.js - replace array access
- [ ] Update renderer.js - update rendering logic
- [ ] Verify grid still renders correctly
- [ ] **Test**: Click booking in grid → should load correctly

**Friday: Verification & Documentation**
- [ ] Run ESLint - should have 0 array format warnings
- [ ] Manual browser testing on desktop & mobile
- [ ] Document any breaking changes
- [ ] Commit: "Phase 1 Week 1: Remove array format"

---

### Week 2: New Services

**Monday-Wednesday: StoreService + Integration**
- [ ] Create StoreService.js
- [ ] Create AuditService.js
- [ ] Add to index.html script load order (FIRST)
- [ ] Test: Store.setState('bookings', [...])
- [ ] Test: Store.subscribe('bookings', callback)
- [ ] **Test**: Make change → AuditService logs it

**Thursday: MatrixAdapter + Integration**
- [ ] Create MatrixAdapter.js
- [ ] Update cascading dropdown logic
- [ ] Test: MatrixAdapter.getRoomTypes()
- [ ] Test: MatrixAdapter.buildLocationOptions()
- [ ] **Test**: Hotel select → room types populate

**Friday: Service Integration & Testing**
- [ ] All three services integrated
- [ ] No console errors
- [ ] Manual testing of data flow
- [ ] Commit: "Phase 1 Week 2: Add StoreService, MatrixAdapter, AuditService"

---

### Week 3: Mobile-First HTML

**Monday-Tuesday: Restructure HTML**
- [ ] Backup index.html
- [ ] Create new mobile-first structure
- [ ] Add header, navigation (drawer + sidebar)
- [ ] Add multi-step form structure
- [ ] Add sticky action buttons
- [ ] **Test**: DOM loads without errors

**Wednesday: Create CSS**
- [ ] Create mobile.css (375px+ base styles)
- [ ] Create tablet.css (768px+ media queries)
- [ ] Create desktop.css (1024px+ layout)
- [ ] Link all 3 CSS files in HTML
- [ ] **Test**: View at different breakpoints

**Thursday: Create Mobile Controllers**
- [ ] Create MobileNavController.js
- [ ] Implement toggleDrawer(), switchTab(), nextStep()
- [ ] Attach event listeners
- [ ] **Test**: Navigation works on mobile

**Friday: Comprehensive Testing**
- [ ] Test on mobile device (375px)
- [ ] Test on tablet (768px)
- [ ] Test on desktop (1024px)
- [ ] Test all navigation flows
- [ ] Test form submission
- [ ] Commit: "Phase 1 Week 3: Mobile-first HTML & CSS"

---

## 🧪 TESTING CHECKLIST

### Unit Testing (Per Service)

#### StoreService
```javascript
// Test: setState & getState
Store.setState('test', {data: 'value'});
assert(Store.getState('test').data === 'value');

// Test: Subscribe
let called = false;
const unsub = Store.subscribe('test', (newVal) => {
  called = true;
});
Store.setState('test', {new: 'data'});
assert(called === true);
unsub();
```

#### CalculationService
```javascript
// Test: calculateNights
assert(CalculationService.calculateNights('2026-01-15', '2026-01-20', 'Phòng') === 5);
assert(CalculationService.calculateNights('2026-01-15', '2026-01-20', 'Vé') === 1);

// Test: calculateRowCost
const cost = CalculationService.calculateRowCost(2, 1000, 1, 500, 100, 0, 1);
assert(cost === 2600);
```

#### MatrixAdapter
```javascript
// Test: getRoomTypes
const rooms = MatrixAdapter.getRoomTypes('Hotel A', [['Hotel A', '', 'Single', 'Double']]);
assert(rooms.includes('Single'));
assert(rooms.includes('Double'));
```

#### AuditService
```javascript
// Test: Log & Query
AuditService.logDataChange('test', 'id1', 'field1', 'old', 'new');
const history = AuditService.queryAuditLog({});
assert(history.length > 0);
```

### Integration Testing

#### Data Flow
- [ ] Load booking from Firestore → object format
- [ ] Display in form → all fields correct
- [ ] Modify field → calculation updates
- [ ] Save → data sent via API
- [ ] Verify → audit log records change

#### Mobile Responsiveness
```
Device          Width   Breakpoint  Result
─────────────────────────────────────────────
iPhone SE       375px   mobile      ✓ Works
iPad Mini       768px   tablet      ✓ Works
iPad Pro       1024px   desktop     ✓ Works
Desktop       1440px   wide        ✓ Works
```

### Browser Compatibility
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

### Performance Testing
```
Load Time Before:  3.2s
Load Time After:   2.8s (target: 1.8s by Phase 4)

Lighthouse Score Before:  65
Lighthouse Score After:   75 (target: 85 by Phase 4)
```

---

## 🐛 DEBUGGING TOOLS

### Console Commands

```javascript
// Check data format
console.log(APP_DATA.bookings_obj[0]);
// Should show: {id: '...', customer_name: '...'}

// Check Store state
console.log(Store.getState());

// Test subscription
Store.subscribe('bookings', (val) => console.log('Changed!', val));

// View audit log
console.log(AuditService.auditLog);

// Find array format code (search in console)
Object.keys(APP_DATA).filter(k => Array.isArray(APP_DATA[k]));
// Should return: []

// Check mobile detection
console.log(ResponsiveLayout.getBreakpoint());
// Should show: 'mobile' | 'tablet' | 'desktop'
```

### Common Issues & Fixes

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| "Cannot read property 'customer_name'" | Data still in array format | Check DataTransformer is used |
| StoreService not defined | Script not loaded | Add to index.html FIRST |
| Mobile drawer not opening | Event listener not attached | Check MobileNavController |
| Styles not applying | CSS not linked | Check media queries match breakpoints |
| Form not saving | Calculation still buggy | Use CalculationService methods |

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/phase-1-refactor

# Daily commits
git add .
git commit -m "Phase 1 Week 1 Day 1: Remove array format from db_manager"

# Push to review
git push origin feature/phase-1-refactor

# After review, merge to develop
git checkout develop
git merge feature/phase-1-refactor
```

---

## 📊 PROGRESS TRACKING

### Burndown Chart Template

```
Week 1: ████████░░ 80% complete
├─ Remove array format: ✅
├─ Create DataTransformer: ✅
├─ Update db_manager.js: 🔄 In progress
└─ Testing: ⏳ Blocked on db_manager

Week 2: ████░░░░░░ 40% complete
├─ StoreService: 🔄 In progress
├─ AuditService: ⏳ Not started
└─ MatrixAdapter: ⏳ Not started

Week 3: ░░░░░░░░░░ 0% complete
├─ Mobile HTML: ⏳ Not started
├─ CSS files: ⏳ Not started
└─ MobileNavController: ⏳ Not started
```

### Daily Stand-Up Template

**What I did yesterday:**
- [ ] Task completed (PR link)
- [ ] Task completed (PR link)

**What I'm doing today:**
- [ ] Task 1 - estimated time
- [ ] Task 2 - estimated time

**Blockers:**
- [ ] None
- [ ] Issue: ... (assigned to: ...)

**Risks:**
- [ ] Performance concern on slow networks
- [ ] Browser compatibility issue

---

## 🎯 DEFINITION OF DONE (DoD)

### Per Task

- [ ] Code complete & tested
- [ ] ESLint passes (0 errors, <5 warnings)
- [ ] PR reviewed & approved
- [ ] Unit tests written & passing
- [ ] Browser compatibility verified
- [ ] Documentation updated
- [ ] Merged to develop

### Per Week

- [ ] All daily tasks closed
- [ ] No critical bugs
- [ ] Performance acceptable
- [ ] QA sign-off obtained
- [ ] Progress documented
- [ ] Team reviewed

### Per Phase

- [ ] All weeks complete
- [ ] Integration tested
- [ ] Performance optimized
- [ ] Documentation final
- [ ] Stakeholder review passed
- [ ] Ready for next phase

---

## 📚 CODE REVIEW CHECKLIST

### For Each PR

- [ ] Code follows style guide (.eslintrc.json)
- [ ] No array format code (Phase 1)
- [ ] Services are pure (no DOM deps)
- [ ] All new functions have JSDoc
- [ ] No console.log (use log() instead)
- [ ] Error handling present
- [ ] Mobile responsive (if UI change)
- [ ] Tests included
- [ ] Performance acceptable
- [ ] No security issues

### Reviewer Questions

1. **Is this the simplest way to do it?**
2. **Can this be tested?**
3. **Will this work on mobile?**
4. **Is the error handling complete?**
5. **Does this follow our patterns?**
6. **Is this code reusable?**
7. **Will a new dev understand this?**

---

## 🚀 GO LIVE CHECKLIST

### Before Release

**Code Quality**
- [ ] All tests passing (80%+ coverage)
- [ ] ESLint 0 errors
- [ ] No console errors in browser
- [ ] Performance acceptable

**Browser Support**
- [ ] Chrome ✓
- [ ] Firefox ✓
- [ ] Safari ✓
- [ ] Edge ✓
- [ ] Mobile browsers ✓

**Functionality**
- [ ] All existing features work
- [ ] New features tested
- [ ] Data saves correctly
- [ ] Calculations accurate

**Performance**
- [ ] Load time < 2.5s
- [ ] Lighthouse score > 80
- [ ] No memory leaks
- [ ] Mobile responsive

**Documentation**
- [ ] README updated
- [ ] Code comments complete
- [ ] Architecture documented
- [ ] Troubleshooting guide ready

**Deployment**
- [ ] Backup created
- [ ] Rollback plan documented
- [ ] Monitoring configured
- [ ] Support briefed

---

## 📞 COMMUNICATION TEMPLATES

### Daily Standup Summary (for Slack)

```
✅ Phase 1 - Week 1 - Day 1 Update

Completed:
• Removed array format from db_manager.js
• Created DataTransformer.js with toBooking() method

In Progress:
• Testing DataTransformer integration
• EST completion: 2 hours

Blockers:
• None

Next: Update utils.js format detection code
```

### Weekly Progress Report

```
📊 Phase 1 - Week 1 Summary

Status: ✅ On Track
Completion: 80%

Completed:
✅ Remove array format detection
✅ Create DataTransformer.js
🔄 Update db_manager.js (95%)

Next Week:
- StoreService implementation
- AuditService setup
- Integration testing

Risks: None identified
Blockers: None
```

### Phase Completion Report

```
🎉 Phase 1 Complete!

Duration: 3 weeks as planned
Quality: Zero critical bugs
Coverage: 85% of code tested

Delivered:
✅ Object-only format (no arrays)
✅ DataTransformer class
✅ StoreService (Pub/Sub)
✅ MatrixAdapter
✅ AuditService
✅ Mobile-first HTML & CSS
✅ MobileNavController

Metrics:
• Array format code: 200 → 0 lines (-100%)
• Load time: 3.2s → 2.8s (-13%)
• Lighthouse: 65 → 75 (+15%)

Ready for: Phase 2
```

---

## 🎓 TRAINING MATERIALS

### For Team Kickoff

**1. Architecture Overview (30 min)**
- Show current vs. target architecture
- Explain service layer
- Show data flow diagram

**2. Code Tour (1 hour)**
- Walk through DataTransformer
- Show Store usage
- Demo mobile structure

**3. Hands-On: First Task (2 hours)**
- Pair with senior dev
- Remove array format from one file together
- Review & merge

**4. Independent Work**
- Assign next task
- Provide PHASE1_QUICK_START.md
- Daily check-ins

---

## 📈 METRICS TO TRACK

### Code Quality
- Lines of code: 8000 → target
- Cyclomatic complexity: per function
- Test coverage: 0% → 80%+
- ESLint violations: should be 0

### Performance
- Bundle size: 400KB → 120KB (minified)
- Load time: 3.2s → 1.8s
- Lighthouse score: 65 → 85+
- Mobile PageSpeed: target 75+

### Team Productivity
- Bugs found: per sprint
- PR cycle time: < 24 hours
- Code review comments: track trends
- Team velocity: tasks/week

### User Experience
- Mobile bounce rate: target < 5%
- Form completion rate: target > 85%
- Error rate: target < 1%
- Performance feedback: track NPS

---

## ✅ FINAL CHECKLIST

### Before Phase 1 Starts

- [ ] Team trained on documentation
- [ ] Git workflow established
- [ ] Development environment set up
- [ ] Testing tools installed
- [ ] Monitoring configured
- [ ] Backup strategy in place
- [ ] Rollback plan documented
- [ ] Stakeholder communication plan ready

### After Phase 1 Completes

- [ ] All code merged to main
- [ ] Tests passing (80%+ coverage)
- [ ] Performance verified
- [ ] Documentation updated
- [ ] Team debriefed
- [ ] Lessons learned captured
- [ ] Metrics reviewed
- [ ] Ready for Phase 2 kickoff

---

**🎯 Use these tools to execute Phase 1-4 successfully!**

**Start**: Week 1, Monday morning  
**Duration**: 9 weeks total  
**Team**: 2-3 developers  
**Expected Outcome**: Modern, maintainable codebase  

🚀 **Let's build it!**

