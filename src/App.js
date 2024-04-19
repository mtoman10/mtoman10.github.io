import './App.css';
import React from "react";
import {useState} from "react";

let date = new Date()
let currentYear = date.getFullYear()

function findClaims(entry,yearWant){

    const claimInfo = []

    let claimID = ''
    let dateOfMedical = ''
    let claimCode = ''
    let location = ''

    if (entry.resource.resourceType === "Claim"){

        let claimData = entry.resource;

        claimID = claimData.id

        dateOfMedical = claimData.billablePeriod.start.substring(0,10);

        //also grab the code associated with the claim
        for (let i=0;i<claimData.type.coding.length;i++){
            claimCode = claimData.type.coding[i].code
        }

        location = claimData.provider.display

        //print only the claims from the last 3 years,
        // eventually have the option to display ones further back
        if (dateOfMedical.substring(0,4) > currentYear - yearWant){

            claimInfo.push({
                date: dateOfMedical,
                location: location,
                claimCode: claimCode,
                claimID: claimID
            });
        }
    }

    return claimInfo
}


function costOfMedical(claimID,jsonData){

    const eofBInfo = []

    jsonData.entry.forEach(entry => {

        if (entry.resource && entry.resource.resourceType === "ExplanationOfBenefit") {
            //get the id of a claim
            const tempClaimID = entry.resource.claim.reference.substring(9)

            //get the list of items from the explanation of benefit
            //get this id from when the person clicks
            //id is from the claim
            if (tempClaimID === claimID) {
                eofBInfo.push({
                    insuranceName: findNameOfInsurance(entry),
                    costOfItem: costOfEachItem(entry,true)
                })
            }

        }
    });


    return eofBInfo
}



function findNameOfInsurance(entry){
    let insuranceName = ""
    if (entry.resource.resourceType === "ExplanationOfBenefit") {

        for (let j = 0; j < entry.resource.contained.length; j++) {
            if (entry.resource.contained[j].resourceType === "Coverage") {
                insuranceName = entry.resource.contained[j].type.text
            }
        }
        console.log("please" + insuranceName)
    }
    return insuranceName
}


//creating the list of items and the cost of item

let itemsNotCovered = []

function costOfEachItem(entry,allData){
    let itemCostList = []
    let itemName = ''
    let itemCost = 0

    let totalCostList = []

    let totalWithoutInsurance = 0
    let totalCostToPatient = 0
    let totalCoveredByInsurance = 0;

    let fixedInsuranceCost = false

    for (let i = 0; i < entry.resource.item.length; i++) {
        const codeValue = entry.resource.item[i].productOrService.coding
        for (let j = 0; j < codeValue.length; j++) {
            itemName = codeValue[j].display
        }

        try {
            itemCost = entry.resource.item[i].net.value

            totalWithoutInsurance += itemCost

            itemCost = itemCost.toFixed(2)

        } catch {
            itemCost = 0
            console.log("no cost associated with item")
        }


    //cost to patient

        let amountPatientPay = 0
        let percentPatientPay = 0


        //are their patients that don't have coinsurance and have something else, need to find them?
        //so far haven't found any that aren't coin and went through a lot of them
        try{
            for (let j=0; j<entry.resource.item[i].adjudication.length; j++) {
                if (entry.resource.item[i].adjudication[j].category.coding[0].display === "Line Beneficiary Coinsurance Amount"){
                    amountPatientPay = entry.resource.item[i].adjudication[j].amount.value

                    //figure out what percent of the total
                    //gives you why you paid the value that you paid
                    percentPatientPay = (amountPatientPay/itemCost) * 100

                    percentPatientPay = percentPatientPay.toFixed(0)

                    totalCostToPatient += amountPatientPay

                    //don't round until the very end
                    amountPatientPay = amountPatientPay.toFixed(2)
                }
            }
        }catch {
            console.log("this item has no cost so it has no adjudication")
        }

    //cost to insurance

        let insuranceAmount = 0;
        let itemHasAdjudication = true;

        try{
            for (let j=0; j<entry.resource.item[i].adjudication.length; j++){
                if (entry.resource.item[i].adjudication[j].category.coding[0].display === "Line Provider Payment Amount"){
                    insuranceAmount = entry.resource.item[i].adjudication[j].amount.value
                    totalCoveredByInsurance += insuranceAmount
                    insuranceAmount = insuranceAmount.toFixed(2)
                }
            }
        }catch {
            console.log("this item has no cost so it has no adjudication")
            //is there a better place to set this?
            itemHasAdjudication = false

        }


        //need to find payment and total. if total is greater than payment, insurance did not cover something
        //pharm ones will be easy. others not as much, basically if the item did not have an adjudication there was something not covered
        //one exception is general examination of patient, there is never a cost with this item and does not cause issues
        let totalCreatedByClaim = 0
        let totalPaymentMadeByInsurance = 0


        //is it always going to be total[0], might want to loop through this
        totalCreatedByClaim = entry.resource.total[0].amount.value
        //console.log("yipyip" + totalCreatedByClaim)

        //this should always match total covered by insurance!!!
        totalPaymentMadeByInsurance = entry.resource.payment.amount.value

        let isEverythingCoveredByInsurance = true

        if (totalPaymentMadeByInsurance < totalCreatedByClaim){
            console.log("not everything was covered by insurance")
            isEverythingCoveredByInsurance = false
        }


        if (!isEverythingCoveredByInsurance && !itemHasAdjudication && !fixedInsuranceCost){
            itemCost = totalCreatedByClaim - totalPaymentMadeByInsurance
            amountPatientPay = itemCost
            totalWithoutInsurance += itemCost
            totalCostToPatient += itemCost
            percentPatientPay = 100
            fixedInsuranceCost = true

            //only want to add unique values, otherwise total the values
            let addItemNotCovered = true
            let temp = 0

            if (itemsNotCovered.length>0){
                for (let i=0; i<itemsNotCovered.length; i++){
                    if (itemsNotCovered[i].itemName === itemName || itemsNotCovered[i].itemName === itemName + " (multiple occurrences during the year)"){
                        addItemNotCovered = false
                        temp = i
                    }
                }

                if (!addItemNotCovered){
                    itemsNotCovered[temp].itemCost += itemCost
                    itemsNotCovered[temp].itemName = itemName + " (multiple occurrences during the year)"
                }
            }

            if (addItemNotCovered){
                itemsNotCovered.push({
                    //add in claim Type??
                    itemName: itemName,
                    itemCost: itemCost
                })
            }

        }

        console.log(itemsNotCovered.length)

//making the big boy array
        //everything related to each item push here
        if (allData){
            itemCostList.push({
                item: itemName,
                cost: parseFloat(itemCost),
                amountPatientPay: parseFloat(amountPatientPay),
                percentPatientPay: percentPatientPay,
                insuranceAmount: parseFloat(insuranceAmount),
            })

        }

    }

    totalWithoutInsurance = totalWithoutInsurance.toFixed(2)
    totalCostToPatient = totalCostToPatient.toFixed(2)
    totalCoveredByInsurance = totalCoveredByInsurance.toFixed(2)
    let totalPercentSavedByPatient = (totalCoveredByInsurance/totalWithoutInsurance) * 100

    totalPercentSavedByPatient = totalPercentSavedByPatient.toFixed(0)


        //at the end of the loop, make another big boy array with all large values?
    totalCostList.push({
        totalWithoutInsurance: parseFloat(totalWithoutInsurance),
        totalCostToPatient: parseFloat(totalCostToPatient),
        totalCoveredByInsurance: parseFloat(totalCoveredByInsurance),
        totalPercentSavedByPatient: totalPercentSavedByPatient

    })

    //this always needs to be pushed in last!!!!
    itemCostList.push({
        overallData: totalCostList
    })


    return itemCostList
}


//at this point, only grab little big boy and do not get each item
function amountSavedForYear(claimDate, jsonData){
    const yearSavings = []

    itemsNotCovered = []

    let totalCostOfYear = 0
    let totalCoveredByInsuranceForYear = 0
    let percentSavedByPatientForYear = 0


    jsonData.entry.forEach(entry => {

        if (entry.resource && entry.resource.resourceType === "ExplanationOfBenefit") {
            //get the id of a claim
            let tempClaimDate = entry.resource.billablePeriod.start.substring(0,4)


            //get the list of items from the explanation of benefit
            //get this year of the selected claim
            if (tempClaimDate === claimDate.substring(0,4)) {
                //grab claimInfo
                let littleData = costOfEachItem(entry,false)

                totalCostOfYear += parseFloat(littleData[0].overallData[0].totalWithoutInsurance)
                totalCoveredByInsuranceForYear += parseFloat(littleData[0].overallData[0].totalCoveredByInsurance)

            }

        }

    });


    percentSavedByPatientForYear = (totalCoveredByInsuranceForYear/totalCostOfYear) *100
    percentSavedByPatientForYear = percentSavedByPatientForYear.toFixed(0)

    totalCoveredByInsuranceForYear = totalCoveredByInsuranceForYear.toFixed(2)
    totalCostOfYear = totalCostOfYear.toFixed(2)

    yearSavings.push({
        totalCostOfYear: parseFloat(totalCostOfYear).toLocaleString("en-US", {style:"currency", currency:"USD"}),
        totalCoveredByInsuranceForYear: parseFloat(totalCoveredByInsuranceForYear).toLocaleString("en-US", {style:"currency", currency:"USD"}),
        percentSavedByPatientForYear: percentSavedByPatientForYear,
        itemsNotCovered: itemsNotCovered
    })

    console.log(yearSavings)


    return yearSavings
}



const Modal = ({isOpen, onClose, yearData, date}) => {
    //don't open if open is false
    if (!isOpen) return null;

    //otherwise open the window
    return (
        <div className="modal-overlay">
            <div className="modal">
                <button onClick={onClose}>Close Items Not Covered</button>
                <ul>
                    {yearData.map((data, index) => (
                        <div key={index}>
                            <h3>Items Not Covered During {date}:</h3>
                            {data.itemsNotCovered.length > 0 ? (
                                <ul>
                                    {data.itemsNotCovered.map((item, idx) => (
                                        <li key={idx}>
                                            <p>{item.itemName} | Cost {item.itemCost.toLocaleString("en-US", {style:"currency", currency:"USD"})}</p>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>All Items were covered under insurance</p>
                            )}
                        </div>
                    ))}
                </ul>

            </div>
        </div>

    );

};

function App() {

    const [data, setData] = useState(null);
    let [patientID, setPatientID] = useState(null)
    let [insurance, setInsurance] = useState(null);
    const [name, setName] = useState("");
    const [birthDate, setBirthDate] = useState("");
    const [page1, setPage1] = useState(true)
    const [page2, setPage2] = useState(false)
    const [claimData, setClaimData] = useState(null)
    const [eofBData,setEofBData] = useState(null);
    const [claimType, setClaimType] = useState(null);
    const [yearBackForClaims, setYearBackForClaims] = useState(3)
    const [selectedClaimID, setSelectedClaimID] = useState(null)
    const [yearData, setYearData] = useState(null)
    const [isWindowOpen, setIsWindowOpen] = useState(false)

    //all the data related to the selected claim
    const [selectedClaimDate,setSelectedClaimDate] = useState(null)
    const [claimLocation, setClaimLocation] = useState(null)


    const openModal = () => {
        setIsWindowOpen(true);
    };

    const closeModal = () => {
        setIsWindowOpen(false);
    };



    const handleSubmitPage1 = async (event) => {
        event.preventDefault();

        const yearOfBirth = birthDate.substring(6)
        const monthOfBirth = birthDate.substring(0,2)
        const dayOfBirth = birthDate.substring(3,5)
        const reformatBirthdate = yearOfBirth + "-" + monthOfBirth + "-" + dayOfBirth

        try {

            //json file is dependent on name inputted by patient
            const jsonData = await import(`./Resources/${name.toLowerCase()}.json`);
            setData(jsonData.default);

            //making sure birthday matches the name
            //my cheat way of making a username and password, if they do not match, do not advance page
            if (reformatBirthdate !== jsonData.entry[0].resource.birthDate){
                alert("Incorrect Combination, please check all the information is accurate")
            }else {
                setPage1(false)
                setPage2(true)
            }

            const claimsArray = []
            jsonData.entry.forEach(entry => {
                if (entry && entry.resource) {
                    if (!patientID) {
                        setPatientID(entry.resource.id);
                    }
                    const insuranceName = findNameOfInsurance(entry);
                    if (!insurance && insuranceName) {
                        setInsurance(insuranceName);
                    }
                    const claims = findClaims(entry,yearBackForClaims)
                    claimsArray.push(...claims)
                }
            });
            setClaimData(claimsArray)


        } catch (error) {
            //if the patient does not exist, do not change the pages
            console.error("name does not match any resources");
            alert("Invalid Name")

        }

        console.log(claimData)

    }

    const handleSubmitPage2 = (event) => {
        event.preventDefault();

    }


    const handleClaimSelection = (pressedClaim) => {

        //set the Explanation of Benefit Data
        setEofBData(costOfMedical(pressedClaim.claimID,data))

        setYearData(amountSavedForYear(pressedClaim.date,data))

        //need the info about the claim for displaying purposes
        setClaimType(pressedClaim.claimCode)

        //keep selected claim highlighted
        setSelectedClaimID(pressedClaim.claimID)

        const selectedDate = pressedClaim.date
        const yearOfClaim = selectedDate.substring(0,4)
        const monthOfClaim = selectedDate.substring(5,7)
        const dayOfClaim  = selectedDate.substring(8,10)
        const cleanDate = monthOfClaim + "-" + dayOfClaim + "-" + yearOfClaim

        console.log(yearOfClaim)
        setSelectedClaimDate(cleanDate)

        setClaimLocation(pressedClaim.location)

    };

//get more claims to display on the sidebar
    const getMoreClaims = () =>{
        setYearBackForClaims(yearBackForClaims+3)
        const newClaimsArray = [];
        data.entry.forEach(entry => {
            if (entry && entry.resource) {
                const claims = findClaims(entry, yearBackForClaims);
                newClaimsArray.push(...claims);
            }
        });
        setClaimData(newClaimsArray);
    }


    //makes all the screen things
    return (
        <form onSubmit={page1 ? handleSubmitPage1:handleSubmitPage2}>
            {page1 && (
                <div className="visible">
                    <header className="App-header">
                        <h1 style={{ fontSize: '85px', color: '#2C0934' }}>Coverage Clarity</h1>
                        <h3 style={{ fontSize: '24px', color: '#C3F2BC' }}>Insurance claims don't have to be complicated</h3>
                        <div className="login-info">
                            <div className="input-group">
                                <label>
                                    <span>Name:</span>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="input-field"
                                    />
                                </label>
                                <label>
                                    <span>Birthdate (mm/dd/yyyy):</span>
                                    <input
                                        type="text"
                                        value={birthDate}
                                        onChange={(e) => setBirthDate(e.target.value)}
                                        className="input-field"
                                    />
                                </label>
                            </div>
                            <input type="submit" value="Login" className="submit-button" />
                        </div>
                    </header>
                </div>
            )}

            {page2 &&(
                <div className="visible">
                    <header className="App-header2">
                        <div className="sidebar">
                            <h1>Claims:</h1>
                            <p>Showing Claims From: {currentYear} through {currentYear-yearBackForClaims}</p>
                            <button onClick={() => getMoreClaims()}>
                                <p>Get more claims</p>
                            </button>
                            <ul>
                                {claimData.map((claim, index) => (
                                    <li key={index}>
                                        <button
                                            onClick={() => handleClaimSelection(claim)}
                                            className={selectedClaimID === claim.claimID ? "selected" : ""}
                                        >
                                            <p>Date: {claim.date}</p>
                                            <p>Location: {claim.location}</p>
                                            <p>Claim Code: {claim.claimCode}</p>
                                            <p>Claim ID: {claim.claimID}</p>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="main-content">
                            {Array.isArray(eofBData) && eofBData.length > 0 ? (

                                <div className="currentClaimInfo">
                                    <h2>Explanation of Benefit Information</h2>
                                    <h3>Treatment at {claimLocation} on {selectedClaimDate}</h3>
                                    <hr/>
                                    <ul>
                                        {eofBData.map((data, index) => (
                                            <li key={index}>
                                                <h4>Name of Insurance: {data.insuranceName}</h4>
                                                <h4>Total Without Insurance: {data.costOfItem[data.costOfItem.length-1].overallData[0].totalWithoutInsurance.toLocaleString("en-US", {style:"currency", currency:"USD"})}</h4>
                                                <h4><span className="patientPayText">Total Cost To Patient: {data.costOfItem[data.costOfItem.length-1].overallData[0].totalCostToPatient.toLocaleString("en-US", {style:"currency", currency:"USD"})}</span></h4>
                                                <h4>Total Cost To Insurance: {data.costOfItem[data.costOfItem.length-1].overallData[0].totalCoveredByInsurance.toLocaleString("en-US", {style:"currency", currency:"USD"})}</h4>
                                                <h4>Total Percent Saved by Patient: {data.costOfItem[data.costOfItem.length-1].overallData[0].totalPercentSavedByPatient}%</h4>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                            ) : (
                                <p>Please Select a Claim</p>
                            )}
                            {Array.isArray(eofBData) && eofBData.length > 0 ? (
                                <div className="yearClaimInfo">
                                    <ul>
                                        {yearData.map((data, index) => (
                                            <li key={index}>
                                                <h2>Claim Totals from the Entire Year of {selectedClaimDate.substring(6,10)}</h2>
                                                <h4>Total Amount Spent This Year: {data.totalCostOfYear}</h4>
                                                <h4>Total Amount Paid By Insurance: {data.totalCoveredByInsuranceForYear}</h4>
                                                <h4>Total Percent Saved This Year: {data.percentSavedByPatientForYear}%</h4>
                                                {data.percentSavedByPatientForYear< 70 ? (
                                                    <h4 className="flagValue">Warning: Percent owed during the year exceeds 30%. Consider reevaluating your coverage</h4>
                                                ):(
                                                    <h4 className="goodValue">Coverage seem appropriate based on your medical needs</h4>
                                                )}
                                            </li>
                                        ))}

                                    </ul>
                                    <button onClick={openModal}>View all the Items Not Covered Under Insurance in {selectedClaimDate.substring(6,10)}</button>
                                    <Modal isOpen={isWindowOpen} onClose={closeModal} yearData={yearData} date ={selectedClaimDate.substring(6,10)}/>
                                </div>
                            ) : null}
                            <hr/>
                            {Array.isArray(eofBData) && eofBData.length > 0 ? (
                                <div className="claimTable">
                                    <h2>Itemized Bill</h2>
                                    <table>
                                        <thead>
                                        <tr>
                                            <th>Item Name</th>
                                            <th>Cost Of Item</th>
                                            <th>Amount Patient Paid</th>
                                            <th>Percent Patient Paid</th>
                                            <th>Cost Covered By Insurance</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {eofBData.map((data, index) => (
                                            data.costOfItem.map((itemValue, index2) => {
                                                if (itemValue.cost > 0) {
                                                    return (
                                                        <tr key={index2}>
                                                            <td>{itemValue.item}</td>
                                                            <td>{itemValue.cost.toLocaleString("en-US", {style:"currency", currency:"USD"})}</td>
                                                            <td><span className="patientPayText">{itemValue.amountPatientPay.toLocaleString("en-US", {style:"currency", currency:"USD"})}</span></td>
                                                            <td className={itemValue.percentPatientPay > 30 ? 'flagValue' : ''}>
                                                                {itemValue.percentPatientPay}%
                                                            </td>
                                                            <td>{itemValue.insuranceAmount.toLocaleString("en-US", {style:"currency", currency:"USD"})}</td>
                                                        </tr>
                                                    );
                                                } else {
                                                    return null;
                                                }
                                            })
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            ):
                                null
                            }
                        </div>
                    </header>
                </div>
            )}


        </form>

    );

}

export default App;
