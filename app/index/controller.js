/**
 * @module timed
 * @submodule timed-controllers
 * @public
 */
import Controller from 'ember-controller'
import moment from 'moment'
import computed, { oneWay } from 'ember-computed-decorators'
import Ember from 'ember'
import service from 'ember-service/inject'
import { task, timeout } from 'ember-concurrency'
import AbsenceValidations from 'timed/validations/absence'
import MultipleAbsenceValidations from 'timed/validations/multiple-absence'

const { testing } = Ember

/**
 * The index controller
 *
 * @class IndexController
 * @extends Ember.Controller
 * @public
 */
export default Controller.extend({
  /**
   * Validations for the edit absence form
   *
   * @property {Object} AbsenceValidations
   * @public
   */
  AbsenceValidations,

  /**
   * Validations for the muliple absence form
   *
   * @property {Object} MultipleAbsenceValidations
   * @public
   */
  MultipleAbsenceValidations,

  /**
   * The query params
   *
   * @property {String[]} queryParams
   * @public
   */
  queryParams: ['day'],

  /**
   * The currently selected day. Initializing as today, in case
   * no query param is specified.
   *
   * @property {String} _day
   * @public
   */
  day: moment().format('YYYY-MM-DD'),

  /**
   * The session service
   *
   * @property {EmberSimpleAuth.SessionService} session
   * @public
   */
  session: service('session'),

  init() {
    this._super(...arguments)

    this.set('newAbsence', {
      dates: [],
      comment: '',
      type: null
    })
  },

  /**
   * All activities
   *
   * @property {Activity[]} _allActivities
   * @private
   */
  @computed()
  _allActivities() {
    return this.store.peekAll('activity')
  },

  /**
   * All activities filtered by the selected day
   *
   * @property {Activity[]} _activities
   * @private
   */
  @computed('date', '_allActivities.@each.{start,isDeleted}')
  _activities(day, activities) {
    return activities.filter(a => {
      return a.get('start').isSame(day, 'day') && !a.get('isDeleted')
    })
  },

  /**
   * The duration sum of all activities of the selected day
   *
   * @property {moment.duration} activitySum
   * @public
   */
  activitySum: moment.duration(),

  /**
   * Compute the current activity sum
   *
   * @method _activitySum
   * @private
   */
  _activitySum: task(function*() {
    for (;;) {
      let duration = this.get('_activities').reduce((dur, cur) => {
        dur.add(cur.get('duration'))

        if (cur.get('activeBlock')) {
          dur.add(moment().diff(cur.get('activeBlock.from')), 'milliseconds')
        }

        return dur
      }, moment.duration())

      this.set('activitySum', duration)

      /* istanbul ignore else */
      if (testing) {
        return
      }

      /* istanbul ignore next */
      yield timeout(1000)
    }
  }).on('init'),

  /**
   * All attendances
   *
   * @property {Attendance[]} _allAttendances
   * @private
   */
  @computed()
  _allAttendances() {
    return this.store.peekAll('attendance')
  },

  /**
   * All attendances filtered by the selected day
   *
   * @property {Attendance[]} _attendances
   * @private
   */
  @computed('date', '_allAttendances.@each.{from,isDeleted}')
  _attendances(day, attendances) {
    return attendances.filter(a => {
      return a.get('from').isSame(day, 'day') && !a.get('isDeleted')
    })
  },

  /**
   * The duration sum of all attendances of the selected day
   *
   * @property {moment.duration} attendanceSum
   * @public
   */
  @computed('_attendances.@each.{from,to}')
  attendanceSum(attendances) {
    return attendances.reduce((dur, cur) => {
      return dur.add(cur.get('to').diff(cur.get('from')), 'milliseconds')
    }, moment.duration())
  },

  /**
   * All reports
   *
   * @property {Report[]} _allReports
   * @private
   */
  @computed()
  _allReports() {
    return this.store.peekAll('report')
  },

  /**
   * All absences
   *
   * @property {Absence[]} _allAbsences
   * @private
   */
  @computed()
  _allAbsences() {
    return this.store.peekAll('absence')
  },

  /**
   * All reports filtered by the selected day
   *
   * @property {Report[]} _reports
   * @private
   */
  @computed('date', '_allReports.@each.{date,isNew,isDeleted}')
  _reports(day, reports) {
    return reports.filter(r => {
      return (
        r.get('date').isSame(day, 'day') &&
        !r.get('isNew') &&
        !r.get('isDeleted')
      )
    })
  },

  /**
   * All absences filtered by the selected day
   *
   * @property {Absence[]} _absences
   * @private
   */
  @computed('date', '_allAbsences.@each.{date,isNew,isDeleted}')
  _absences(day, absences) {
    return absences.filter(a => {
      return (
        a.get('date').isSame(day, 'day') &&
        !a.get('isNew') &&
        !a.get('isDeleted')
      )
    })
  },

  /**
   * The duration sum of all reports of the selected day
   *
   * @property {moment.duration} reportSum
   * @public
   */
  @computed('_reports.@each.duration', '_absences.@each.duration')
  reportSum(reports, absences) {
    let reportDurations = reports.mapBy('duration')
    let absenceDurations = absences.mapBy('duration')

    return [...reportDurations, ...absenceDurations].reduce(
      (val, dur) => val.add(dur),
      moment.duration()
    )
  },

  /**
   * The absence of the current day if available
   *
   * This should always be the first of all absences of the day because in
   * theory, we can only have one absence per day.
   *
   * @property {Absence} absence
   * @public
   */
  @computed('_absences.[]')
  absence(absences) {
    return absences.getWithDefault('firstObject', null)
  },

  /**
   * All absence types
   *
   * @property {AbsenceType[]} absenceTypes
   * @public
   */
  @computed()
  absenceTypes() {
    return this.store.peekAll('absence-type')
  },

  /**
   * The currently selected day as a moment object
   *
   * @property {moment} date
   * @public
   */
  @computed('day')
  date: {
    get(day) {
      return moment(day, 'YYYY-MM-DD')
    },
    set(value) {
      this.set('day', value.format('YYYY-MM-DD'))

      return value
    }
  },

  /**
   * The expected worktime of the user
   *
   * @property {moment.duration} expectedWorktime
   * @public
   */
  @oneWay('user.activeEmployment.worktimePerDay')
  expectedWorktime: moment.duration(),

  /**
   * The workdays for the location related to the users active employment
   *
   * @property {Number[]} workdays
   * @public
   */
  @oneWay('user.activeEmployment.location.workdays') workdays: [],

  /**
   * The data for the weekly overview
   *
   * @property {Object[]} weeklyOverviewData
   * @public
   */
  @computed(
    '_allReports.@each.{duration,date}',
    '_allAbsences.@each.{duration,date}',
    'date'
  )
  weeklyOverviewData(allReports, allAbsences, date) {
    let task = this.get('_weeklyOverviewData')

    task.perform(allReports, allAbsences, date)

    return task
  },

  /**
   * The task to compute the data for the weekly overview
   *
   * @property {EmberConcurrency.Task} _weeklyOverviewData
   * @private
   */
  _weeklyOverviewData: task(function*(allReports, allAbsences, date) {
    yield timeout(200)

    allReports = allReports.filter(r => !r.get('isDeleted') && !r.get('isNew'))
    allAbsences = allAbsences.filter(
      a => !a.get('isDeleted') && !a.get('isNew')
    )

    let allHolidays = this.store.peekAll('public-holiday')

    // Build an object containing report and absence durations by date:
    // {
    //  '2017-03-21': { reports: [duration1, duration2, ...], absences: [duration1, ...]
    //  ...
    // }
    let container = [...allReports, ...allAbsences].reduce((obj, model) => {
      let d = model.get('date').format('YYYY-MM-DD')

      obj[d] = obj[d] || { reports: [], absences: [] }

      obj[d][`${model.constructor.modelName}s`].push(model.get('duration'))

      return obj
    }, {})

    return Array.from({ length: 31 }, (v, k) =>
      moment(date).add(k - 20, 'days')
    ).map(d => {
      let { reports = [], absences = [] } =
        container[d.format('YYYY-MM-DD')] || {}

      return {
        day: d,
        active: d.isSame(date, 'day'),
        absence: !!absences.length,
        workday: this.get('workdays').includes(d.isoWeekday()),
        worktime: [...reports, ...absences].reduce(
          (val, dur) => val.add(dur),
          moment.duration()
        ),
        holiday: !!allHolidays.filter(holiday => holiday.get('date').isSame(d))
          .length
      }
    })
  }).restartable(),

  /**
   * Dates on which no absence can be created
   *  * Weekends
   *  * Days on which an absence exists
   *  * Public holidays
   *
   * @property {moment[]} disabledDates
   * @public
   */
  disabledDates: [],

  /**
   * Set a new center for the calendar and load all disabled dates
   *
   * @method setCenter
   * @param {Object} value The value to set center to
   * @param {moment} value.moment The moment version of the value
   * @param {Date} value.date The date version of the value
   * @public
   */
  setCenter: task(function*({ moment: center }) {
    let from = moment(center)
      .startOf('month')
      .startOf('week')
      .startOf('day')
      .add(1, 'days')
    let to = moment(center)
      .endOf('month')
      .endOf('week')
      .endOf('day')
      .add(1, 'days')

    /* eslint-disable camelcase */
    let params = {
      from_date: from.format('YYYY-MM-DD'),
      to_date: to.format('YYYY-MM-DD')
    }
    /* eslint-enable camelcase */

    let absences = yield this.store.query('absence', params)

    let publicHolidays = yield this.store.query('public-holiday', {
      ...params,
      location: this.get('user.activeEmployment.location.id')
    })

    let disabled = [...absences.mapBy('date'), ...publicHolidays.mapBy('date')]
    let date = moment(from)
    let workdays = this.get('workdays')

    while (date < to) {
      if (!workdays.includes(date.isoWeekday())) {
        disabled.push(moment(date))
      }
      date.add(1, 'days')
    }

    this.set('disabledDates', disabled)
    this.set('center', center)
  }).drop(),

  /**
   * The disabled dates without the current date
   *
   * @property {moment[]} disabledDatesForEdit
   * @public
   */
  @computed('absence.date', 'disabledDates.[]')
  disabledDatesForEdit(current, disabled) {
    return disabled.filter(d => !d.isSame(current, 'day'))
  },

  actions: {
    /**
     * Rollback the changes made in the absence dialogs
     *
     * @method rollback
     * @param {EmberChangeset.Changeset} changeset The changeset to rollback
     * @public
     */
    rollback(changeset) {
      changeset.rollback()
    }
  }
})
